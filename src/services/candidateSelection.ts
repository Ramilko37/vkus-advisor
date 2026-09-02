import type { BasketIntent, NormalizedProduct } from "../types/domain";

export interface LlmCandidateProduct {
  xmlId: string;
  retailer?: NormalizedProduct["retailer"];
  name: string;
  priceRub: number;
  purpose: string;
  weightLabel?: string;
  rating?: number;
  calories?: number;
  proteins?: number;
  restrictionHits?: string[];
  composition?: string;
}

export const MAX_SEARCH_QUERIES = 5;
export const MAX_SEARCH_RESULTS_PER_QUERY = 4;
export const MAX_RAW_CANDIDATES = 20;
export const MAX_LLM_CANDIDATES = 16;
export const MAX_BASKET_ITEMS_FROM_LLM = 12;

export function selectCandidatesForLlm(products: NormalizedProduct[], intent: BasketIntent, maxCandidates = MAX_LLM_CANDIDATES) {
  const grouped = new Map<string, NormalizedProduct[]>();
  for (const product of dedupeProducts(products).filter((item) => item.xmlId && item.priceRub > 0)) {
    const key = product.sourceQuery || "other";
    grouped.set(key, [...(grouped.get(key) || []), product]);
  }

  for (const [key, group] of grouped) grouped.set(key, group.sort((a, b) => scoreProduct(b, intent) - scoreProduct(a, intent)));

  const selected: NormalizedProduct[] = [];
  while (selected.length < maxCandidates && Array.from(grouped.values()).some((group) => group.length)) {
    for (const group of grouped.values()) {
      const next = group.shift();
      if (next) selected.push(next);
      if (selected.length >= maxCandidates) break;
    }
  }
  return selected;
}

export function toLlmCandidate(product: NormalizedProduct, intent: BasketIntent): LlmCandidateProduct {
  const restrictions = [...intent.excludedIngredients, ...intent.dietaryRestrictions];
  const needsComposition = restrictions.length > 0;
  const needsNutrition = [...intent.preferences, intent.originalRequest].some((value) => /белк|протеин|фитнес|калори|кбжу/i.test(value));
  const restrictionHits = findRestrictionHits(product, restrictions);

  return {
    xmlId: product.xmlId,
    ...(product.retailer ? { retailer: product.retailer } : {}),
    name: product.name.trim().slice(0, 100),
    priceRub: Math.round(product.priceRub),
    purpose: product.sourceQuery.trim().slice(0, 40),
    ...(product.weightLabel ? { weightLabel: product.weightLabel.trim().slice(0, 40) } : {}),
    ...(typeof product.rating === "number" ? { rating: Math.round(product.rating * 10) / 10 } : {}),
    ...(needsNutrition && typeof product.proteins === "number" ? { proteins: product.proteins } : {}),
    ...(needsNutrition && typeof product.calories === "number" ? { calories: product.calories } : {}),
    ...(restrictionHits.length ? { restrictionHits } : {}),
    ...(needsComposition && product.composition ? { composition: product.composition.trim().slice(0, 240) } : {}),
  };
}

export function candidatePayloadBytes(candidates: LlmCandidateProduct[]) {
  return new TextEncoder().encode(JSON.stringify(candidates)).length;
}

function scoreProduct(product: NormalizedProduct, intent: BasketIntent) {
  const readyFoodScore = /готов|суп|плов|салат|паста|сырник/i.test(product.name) ? 2 : 0;
  const rating = product.rating || 0;
  const cheap = product.priceRub > 0 ? 1000 / product.priceRub : 0;
  if (intent.priority === "budget") return cheap * 3 + rating;
  if (intent.priority === "speed") return readyFoodScore * 3 + rating + cheap;
  return rating * 2 + cheap;
}

function findRestrictionHits(product: NormalizedProduct, restrictions: string[]) {
  const haystack = `${product.name} ${product.composition ?? ""}`.toLocaleLowerCase("ru-RU");
  return restrictions.filter((restriction) => restriction && haystack.includes(restriction.toLocaleLowerCase("ru-RU"))).slice(0, 5);
}

function dedupeProducts(products: NormalizedProduct[]) {
  const map = new Map<string, NormalizedProduct>();
  for (const product of products) {
    const current = map.get(product.xmlId);
    if (!current || completeness(product) > completeness(current)) map.set(product.xmlId, product);
  }
  return Array.from(map.values());
}

function completeness(product: NormalizedProduct) {
  return Object.values(product).filter((value) => value !== undefined && value !== "").length;
}
