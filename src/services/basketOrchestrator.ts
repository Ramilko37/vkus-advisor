import { basketPrompt } from "../prompts/basketPrompt";
import { intentPrompt } from "../prompts/intentPrompt";
import { basketDraftJsonSchema, basketDraftResponseSchema, basketIntentJsonSchema, basketIntentSchema } from "../schemas";
import type { BasketIntent, BasketVariant, BasketVariantDraft, CatalogClient, NormalizedProduct, StructuredGenerationResult } from "../types/domain";
import { hydrateAndValidateVariants } from "./basketValidation";
import { candidatePayloadBytes, selectCandidatesForLlm, toLlmCandidate } from "./candidateSelection";
import { compactPreviousIntent, normalizeBasketIntent } from "./intentUtils";
import { measureStage } from "./pipelineMetrics";
import { retrieveCandidateProducts } from "./retrieveCandidateProducts";
import type { z } from "zod";

interface OpenRouterClientLike {
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
  openRouter: OpenRouterClientLike,
  sessionId: string,
  signal?: AbortSignal,
) {
  const result = await openRouter.generateStructured<BasketIntent>({
    systemPrompt: intentPrompt,
    userPayload: { previousIntent: compactPreviousIntent(previousIntent), selectedBasketSummary, newUserMessage: message.slice(0, 2000) },
    jsonSchema: basketIntentJsonSchema,
    validator: basketIntentSchema,
    sessionId,
    stage: "intent",
    signal,
  });
  return { ...result, data: normalizeBasketIntent(result.data) };
}

export async function composeBaskets(
  intent: BasketIntent,
  catalog: CatalogClient,
  openRouter: OpenRouterClientLike,
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
  candidates = selectCandidatesForLlm(candidates, intent);
  if (candidates.length < 4) {
    throw new Error("Не удалось найти достаточно подходящих товаров. Попробуйте упростить ограничения.");
  }
  const llmCandidates = candidates.map((product) => toLlmCandidate(product, intent));

  const basketResult = await openRouter.generateStructured<{ variants: BasketVariantDraft[] }>({
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

  const variants = hydrateAndValidateVariants(basketResult.data.variants, candidates, intent);
  const strategies = new Set(variants.map((variant) => variant.strategy));
  if (variants.length !== 3 || strategies.size !== 3 || variants.some((variant) => variant.items.length === 0)) {
    throw new Error("Модель вернула неподходящий формат. Повторите сборку корзины.");
  }
  return {
    intent,
    candidates,
    variants,
    models: [basketResult.model],
    candidatePayloadBytes: candidatePayloadBytes(llmCandidates),
    catalogSearchMs: search.durationMs,
    rawCandidateCount,
    finalCandidateCount: candidates.length,
    catalogRequestCount: reusedCandidates ? 0 : intent.searchQueries.slice(0, 5).length,
    catalogReused,
    basketRetryCount: basketResult.retryCount || 0,
    basketFallbackModelUsed: Boolean(basketResult.fallbackModelUsed),
    basketPromptTokens: basketResult.usage?.promptTokens,
    basketCompletionTokens: basketResult.usage?.completionTokens,
    basketReasoningTokens: basketResult.usage?.reasoningTokens,
  };
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

export function basketSummary(variant: BasketVariant | null) {
  if (!variant) return null;
  return {
    strategy: variant.strategy,
    totalRub: variant.totalRub,
    items: variant.items.slice(0, 12).map((item) => ({ name: item.name.slice(0, 80), quantity: item.quantity })),
  };
}
