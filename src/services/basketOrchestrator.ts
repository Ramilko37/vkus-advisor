import { basketPrompt } from "../prompts/basketPrompt";
import { intentPrompt } from "../prompts/intentPrompt";
import { basketDraftJsonSchema, basketDraftResponseSchema, basketIntentJsonSchema, basketIntentSchema } from "../schemas";
import type { BasketIntent, BasketItem, BasketItemRole, BasketReasonCode, BasketVariant, BasketVariantDraft, CatalogClient, NormalizedProduct, RetailerResult, StructuredGenerationResult, UserProfile } from "../types/domain";
import { hydrateAndValidateVariants } from "./basketValidation";
import { candidatePayloadBytes, selectCandidatesForLlm, toLlmCandidate } from "./candidateSelection";
import { compactPreviousIntent, normalizeBasketIntent } from "./intentUtils";
import { measureStage } from "./pipelineMetrics";
import { retrieveCandidateProducts } from "./retrieveCandidateProducts";
import type { z } from "zod";

interface LlmClientLike {
  generateStructured<T>(options: {
    systemPrompt: string;
    userPayload: unknown;
    jsonSchema: Record<string, unknown>;
    validator: z.ZodType<T>;
    sessionId: string;
    stage: "intent" | "basket";
    maxTokens?: number;
    signal?: AbortSignal;
  }): Promise<StructuredGenerationResult<T>>;
}

export interface ComposeResult {
  intent: BasketIntent;
  candidates: NormalizedProduct[];
  variants: BasketVariant[];
  retailerResults: RetailerResult[];
  models: string[];
  candidatePayloadBytes: number;
  catalogSearchMs: number;
  rawCandidateCount: number;
  finalCandidateCount: number;
  catalogRequestCount: number;
  catalogReused: boolean;
  basketRetryCount: number;
  basketFallbackModelUsed: boolean;
  basketPromptTokens?: number;
  basketCompletionTokens?: number;
  basketReasoningTokens?: number;
}

export async function analyzeIntent(
  message: string,
  previousIntent: BasketIntent | null,
  selectedBasketSummary: unknown,
  llm: LlmClientLike,
  sessionId: string,
  signal?: AbortSignal,
  profile?: UserProfile,
) {
  const result = await llm.generateStructured<BasketIntent>({
    systemPrompt: intentPrompt,
    userPayload: { previousIntent: compactPreviousIntent(previousIntent), selectedBasketSummary, profileDefaults: profile ? profileDefaults(profile) : null, newUserMessage: message.slice(0, 2000) },
    jsonSchema: basketIntentJsonSchema,
    validator: basketIntentSchema,
    sessionId,
    stage: "intent",
    signal,
  });
  return { ...result, data: normalizeBasketIntent(result.data) };
}

function profileDefaults(profile: UserProfile) {
  return {
    address: profile.address || null,
    people: profile.householdSize,
    excludedIngredients: profile.excludedIngredients,
    preferences: profile.preferences,
  };
}

export async function composeBaskets(
  intent: BasketIntent,
  catalog: CatalogClient,
  llm: LlmClientLike,
  sessionId: string,
  signal?: AbortSignal,
  reusedCandidates?: NormalizedProduct[],
): Promise<ComposeResult> {
  const catalogReused = Boolean(reusedCandidates);
  const search = catalogReused
    ? { result: reusedCandidates ?? [], durationMs: 0 }
    : await measureStage(() => retrieveCandidateProducts(intent, catalog, signal));
  let candidates = search.result;
  if (!reusedCandidates && catalog.mode === "demo" && candidates.length < 4) {
    candidates = await retrieveCandidateProducts({ ...intent, searchQueries: fallbackQueries(intent) }, catalog, signal);
  }
  const rawCandidateCount = candidates.length;
  const retailerGroups = groupCandidatesByRetailer(candidates);
  const selectedGroups = retailerGroups
    .map((group) => ({ retailer: group.retailer, candidates: selectCandidatesForLlm(group.candidates, intent) }));
  const composableGroups = selectedGroups.filter((group) => group.candidates.length >= 4);
  console.info("basket_candidate_groups", {
    raw: countProductsByRetailer(candidates),
    selected: countGroupsByRetailer(selectedGroups),
    composable: countGroupsByRetailer(composableGroups),
  });
  candidates = selectedGroups.flatMap((group) => group.candidates);
  if (!composableGroups.length) {
    throw new Error("Не удалось найти достаточно подходящих товаров. Попробуйте упростить ограничения.");
  }
  const basketResults = await Promise.allSettled(composableGroups.map((group) => composeRetailerBaskets(group, intent, llm, sessionId, signal)));
  const llmCandidates = composableGroups.flatMap((group) => group.candidates.map((product) => toLlmCandidate(product, intent)));
  const variants = await refreshValidatedBasketItems(basketResults.flatMap((result) => result.status === "fulfilled" ? result.value.variants : []), catalog, signal);
  const strategies = new Set(variants.map((variant) => variant.strategy));
  if (variants.length < 3 || strategies.size !== 3 || variants.some((variant) => variant.items.length === 0)) {
    throw new Error("Модель вернула неподходящий формат. Повторите сборку корзины.");
  }
  const retailerResults = buildRetailerResults(retailerGroups, selectedGroups, basketResults);
  return {
    intent,
    candidates,
    variants,
    retailerResults,
    models: basketResults.flatMap((result) => result.status === "fulfilled" ? [result.value.model] : []),
    candidatePayloadBytes: candidatePayloadBytes(llmCandidates),
    catalogSearchMs: search.durationMs,
    rawCandidateCount,
    finalCandidateCount: candidates.length,
    catalogRequestCount: reusedCandidates ? 0 : intent.searchQueries.slice(0, 5).length,
    catalogReused,
    basketRetryCount: fulfilledBasketResults(basketResults).reduce((sum, result) => sum + (result.retryCount || 0), 0),
    basketFallbackModelUsed: fulfilledBasketResults(basketResults).some((result) => result.fallbackModelUsed),
    basketPromptTokens: sumUsage(fulfilledBasketResults(basketResults), "promptTokens"),
    basketCompletionTokens: sumUsage(fulfilledBasketResults(basketResults), "completionTokens"),
    basketReasoningTokens: sumUsage(fulfilledBasketResults(basketResults), "reasoningTokens"),
  };
}

async function composeRetailerBaskets(
  group: { retailer?: NormalizedProduct["retailer"]; candidates: NormalizedProduct[] },
  intent: BasketIntent,
  llm: LlmClientLike,
  sessionId: string,
  signal?: AbortSignal,
) {
  const llmCandidates = group.candidates.map((product) => toLlmCandidate(product, intent));
  let basketResult: StructuredGenerationResult<{ variants: BasketVariantDraft[] }>;
  let variants: BasketVariant[];
  try {
    basketResult = await llm.generateStructured<{ variants: BasketVariantDraft[] }>({
      systemPrompt: basketPrompt,
      userPayload: {
        intent,
        candidateProducts: llmCandidates,
      },
      jsonSchema: basketDraftJsonSchema,
      validator: basketDraftResponseSchema,
      sessionId,
      stage: "basket",
      maxTokens: 1800,
      signal,
    });
    variants = hydrateAndValidateVariants(basketResult.data.variants, group.candidates, intent);
  } catch {
    basketResult = { model: "deterministic-fallback", data: { variants: [] }, fallbackModelUsed: true };
    variants = [];
  }
  return {
    ...basketResult,
    variants: (variants.length === 3 ? variants : deterministicRetailerVariants(group.candidates, intent)).map((variant) => ({
      ...variant,
      id: group.retailer ? `${group.retailer}:${variant.id}` : variant.id,
      retailer: group.retailer,
    })),
  };
}

function deterministicRetailerVariants(candidates: NormalizedProduct[], intent: BasketIntent): BasketVariant[] {
  const selected = selectCandidatesForLlm(candidates, intent, 12);
  const cheap = [...selected].sort((a, b) => a.priceRub - b.priceRub);
  const quick = [...selected].sort((a, b) => quickScore(b) - quickScore(a));
  const drafts: BasketVariantDraft[] = [
    deterministicDraft("balanced", selected.slice(0, 8)),
    deterministicDraft("budget", cheap.slice(0, 8)),
    deterministicDraft("speed", quick.slice(0, 8)),
  ];
  return hydrateAndValidateVariants(drafts, selected, intent);
}

function deterministicDraft(strategy: BasketVariant["strategy"], products: NormalizedProduct[]): BasketVariantDraft {
  return {
    strategy,
    items: products.slice(0, 8).map((product) => ({ xmlId: product.xmlId, quantity: 1, role: roleForProduct(product), reasonCode: reasonForStrategy(strategy) })),
  };
}

function quickScore(product: NormalizedProduct) {
  return /готов|обед|плов|салат|картофель|котлет|суп|су-вид|нарез/i.test(product.name) ? 2 : 0;
}

function roleForProduct(product: NormalizedProduct): BasketItemRole {
  if (/кур|мяс|филе|бедр|свин|говяд|яйц|творог|сыр/i.test(product.name)) return "protein";
  if (/рис|греч|картоф|макарон|паста/i.test(product.name)) return "side";
  if (/овощ|зелень|лук|морков|томат|огур|салат/i.test(product.name)) return "vegetables";
  if (/готов|обед|плов|котлет|суп/i.test(product.name)) return "ready_food";
  return "other";
}

function reasonForStrategy(strategy: BasketVariant["strategy"]): BasketReasonCode {
  if (strategy === "budget") return "budget_fit";
  if (strategy === "speed") return "quick";
  return "requested_by_user";
}

function groupCandidatesByRetailer(candidates: NormalizedProduct[]) {
  const groups = new Map<string, { retailer?: NormalizedProduct["retailer"]; candidates: NormalizedProduct[] }>();
  for (const product of candidates) {
    const key = product.retailer || "demo";
    const group = groups.get(key) || { retailer: product.retailer, candidates: [] };
    group.candidates.push(product);
    groups.set(key, group);
  }
  return ["vkusvill", "lenta", "pyaterochka", "demo"].flatMap((key) => groups.get(key) || []);
}

function countProductsByRetailer(products: NormalizedProduct[]) {
  return products.reduce<Record<string, number>>((counts, product) => {
    const key = product.retailer || "demo";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function countGroupsByRetailer(groups: Array<{ retailer?: NormalizedProduct["retailer"]; candidates: NormalizedProduct[] }>) {
  return groups.reduce<Record<string, number>>((counts, group) => {
    counts[group.retailer || "demo"] = group.candidates.length;
    return counts;
  }, {});
}

function buildRetailerResults(
  rawGroups: Array<{ retailer?: NormalizedProduct["retailer"]; candidates: NormalizedProduct[] }>,
  selectedGroups: Array<{ retailer?: NormalizedProduct["retailer"]; candidates: NormalizedProduct[] }>,
  basketResults: Array<PromiseSettledResult<StructuredGenerationResult<{ variants: BasketVariantDraft[] }> & { variants: BasketVariant[] }>>,
): RetailerResult[] {
  const rawCounts = new Map(rawGroups.map((group) => [group.retailer || "demo", group.candidates.length]));
  const selectedCounts = new Map(selectedGroups.map((group) => [group.retailer || "demo", group.candidates.length]));
  const resultByRetailer = new Map<string, PromiseSettledResult<StructuredGenerationResult<{ variants: BasketVariantDraft[] }> & { variants: BasketVariant[] }>>();
  selectedGroups.filter((group) => group.candidates.length >= 4).forEach((group, index) => {
    resultByRetailer.set(group.retailer || "demo", basketResults[index]);
  });

  const retailers = rawGroups.some((group) => !group.retailer || group.retailer === "demo")
    ? (["demo"] as const)
    : (["vkusvill", "lenta", "pyaterochka"] as const);
  return retailers.map((retailer) => {
    const candidateCount = rawCounts.get(retailer) || 0;
    const selectedCandidateCount = selectedCounts.get(retailer) || 0;
    const result = resultByRetailer.get(retailer);
    const variantCount = result?.status === "fulfilled" ? result.value.variants.length : 0;
    if (!candidateCount) return { retailer, status: "no_candidates", candidateCount, selectedCandidateCount, variantCount, message: "Каталог не вернул подходящие товары." };
    if (selectedCandidateCount < 4) return { retailer, status: "insufficient_candidates", candidateCount, selectedCandidateCount, variantCount, message: "Недостаточно товаров для трёх корзин." };
    if (result?.status === "fulfilled" && variantCount === 3) return { retailer, status: "ready", candidateCount, selectedCandidateCount, variantCount };
    return { retailer, status: "failed", candidateCount, selectedCandidateCount, variantCount, message: "Не удалось собрать три валидные корзины." };
  });
}

function fulfilledBasketResults(
  results: Array<PromiseSettledResult<StructuredGenerationResult<unknown>>>,
): Array<StructuredGenerationResult<unknown>> {
  return results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
}

function sumUsage(results: Array<StructuredGenerationResult<unknown>>, key: "promptTokens" | "completionTokens" | "reasoningTokens") {
  const values = results.map((result) => result.usage?.[key]).filter((value): value is number => typeof value === "number");
  return values.length ? values.reduce((sum, value) => sum + value, 0) : undefined;
}

function fallbackQueries(intent: BasketIntent) {
  const sort = intent.priority === "budget" ? "price_asc" : "popularity";
  return [
    { query: "курица", purpose: "белок", sort },
    { query: "гречка", purpose: "гарнир", sort },
    { query: "овощи", purpose: "овощи", sort },
    { query: "готовая еда", purpose: "быстрые блюда", sort: intent.priority === "speed" ? "rating" : "popularity" },
    { query: "завтрак", purpose: "завтрак", sort },
    { query: "перекус", purpose: "перекус", sort },
  ] as BasketIntent["searchQueries"];
}

async function refreshValidatedBasketItems(variants: BasketVariant[], catalog: CatalogClient, signal?: AbortSignal): Promise<BasketVariant[]> {
  const items = variants.flatMap((variant) => variant.items).filter((item) => item.retailer === "lenta");
  if (!items.length || !catalog.validateBasketItems) return variants;
  const uniqueItems = Array.from(new Map(items.map((item) => [item.xmlId, { xmlId: item.xmlId, quantity: item.quantity, priceRub: item.priceRub }])).values());
  try {
    const validation = await catalog.validateBasketItems(uniqueItems, signal);
    const products = new Map(validation.products.map((product) => [product.xmlId, product]));
    const unavailable = new Set(validation.unavailableXmlIds);
    const changed = new Set(validation.changedPrices.map((item) => item.xmlId));
    const missingRefresh = new Set(uniqueItems
      .filter((item) => !products.has(item.xmlId) && !unavailable.has(item.xmlId))
      .map((item) => item.xmlId));
    return variants.map((variant) => recalculateVariant({
      ...variant,
      items: variant.items.flatMap((item) => {
        if (item.retailer !== "lenta") return item;
        if (unavailable.has(item.xmlId)) return [];
        const product = products.get(item.xmlId);
        return product ? { ...product, quantity: item.quantity, role: item.role, reason: item.reason } : item;
      }),
      warnings: Array.from(new Set([
        ...variant.warnings,
        ...(variant.items.some((item) => unavailable.has(item.xmlId)) ? ["Часть товаров Ленты больше недоступна."] : []),
        ...(variant.items.some((item) => changed.has(item.xmlId)) ? ["Цены Ленты обновлены перед показом корзины."] : []),
        ...(variant.items.some((item) => missingRefresh.has(item.xmlId)) ? ["Не удалось обновить часть товаров Ленты. Проверьте цену перед оформлением."] : []),
      ])),
    }));
  } catch {
    return variants.map((variant) => ({
      ...variant,
      warnings: Array.from(new Set([...variant.warnings, "Не удалось обновить данные Ленты. Попробуйте ещё раз."])),
    }));
  }
}

function recalculateVariant(variant: BasketVariant): BasketVariant {
  const items = variant.items as BasketItem[];
  const totalRub = Math.round(items.reduce((sum, item) => sum + item.priceRub * item.quantity, 0));
  return { ...variant, items, totalRub, uniqueItemsCount: items.length };
}

export function basketSummary(variant: BasketVariant | null) {
  if (!variant) return null;
  return {
    strategy: variant.strategy,
    totalRub: variant.totalRub,
    items: variant.items.slice(0, 12).map((item) => ({ name: item.name.slice(0, 80), quantity: item.quantity })),
  };
}
