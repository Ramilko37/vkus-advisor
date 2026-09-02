import type { BasketIntent, SearchQuery } from "../types/domain";

export function normalizeBasketIntent(intent: BasketIntent): BasketIntent {
  return {
    ...intent,
    originalRequest: intent.originalRequest.slice(0, 2000),
    people: clampInteger(intent.people, 1, 20),
    days: clampInteger(intent.days, 1, 31),
    budgetIsHard: Boolean(intent.budgetRub !== null && intent.budgetIsHard),
    maxCookingMinutes: intent.maxCookingMinutes === null ? null : clampInteger(intent.maxCookingMinutes, 0, 360),
    meals: uniqueNormalizedStrings(intent.meals).slice(0, 6),
    excludedIngredients: uniqueNormalizedStrings(intent.excludedIngredients).slice(0, 20),
    dietaryRestrictions: uniqueNormalizedStrings(intent.dietaryRestrictions ?? []).slice(0, 20),
    preferences: uniqueNormalizedStrings(intent.preferences).slice(0, 20),
    assumptions: uniqueNormalizedStrings(intent.assumptions).slice(0, 4),
    searchQueries: deduplicateSearchQueries(intent.searchQueries).slice(0, 5),
    clarificationQuestion: intent.needsClarification ? intent.clarificationQuestion?.slice(0, 240) ?? null : null,
  };
}

export function applyFastIntentPatch(message: string, intent: BasketIntent): BasketIntent | null {
  const value = message.trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
  const resolve = (patch: Partial<BasketIntent>): BasketIntent => ({
    ...intent,
    ...patch,
    needsClarification: false,
    clarificationQuestion: null,
  });

  if (/^(сделай )?(дешевле|подешевле|бюджетнее)\.?$/.test(value)) return resolve({ priority: "budget" });

  if (/(меньше готовить|почти без готовки|максимально быстро)/.test(value)) {
    return resolve({ priority: "speed", maxCookingMinutes: Math.min(intent.maxCookingMinutes ?? 15, 15) });
  }

  const minutesMatch = value.match(/(?:до|максимум|не больше)\s+(\d+)\s*(?:мин|минут)/);
  if (minutesMatch) return resolve({ maxCookingMinutes: clampInteger(Number(minutesMatch[1]), 0, 360) });

  const peopleMatch = value.match(/(?:на|для)\s+(\d+)\s+(?:человек|человека|людей)/);
  if (peopleMatch) return resolve({ people: clampInteger(Number(peopleMatch[1]), 1, 20) });

  const daysMatch = value.match(/(?:на)\s+(\d+)\s+(?:день|дня|дней)/);
  if (daysMatch) return resolve({ days: clampInteger(Number(daysMatch[1]), 1, 31) });

  const budgetMatch = value.match(/(?:до|бюджет(?:ом)?)\s+(\d[\d\s]*)\s*(?:₽|руб)/);
  if (budgetMatch) return resolve({ budgetRub: clampInteger(Number(budgetMatch[1].replace(/\s/g, "")), 1, 1_000_000), budgetIsHard: true });

  return null;
}

export function buildCatalogFingerprint(intent: BasketIntent, address = ""): string {
  return JSON.stringify({
    address: address.trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " "),
    meals: [...intent.meals].sort(),
    excludedIngredients: [...intent.excludedIngredients].sort(),
    dietaryRestrictions: [...intent.dietaryRestrictions].sort(),
    preferences: [...intent.preferences].sort(),
    readyFoodAllowed: intent.readyFoodAllowed,
  });
}

export function compactPreviousIntent(intent: BasketIntent | null): BasketIntent | null {
  if (!intent) return null;
  return { ...intent, searchQueries: [] };
}

export function deduplicateSearchQueries(queries: SearchQuery[]): SearchQuery[] {
  const seen = new Set<string>();
  return queries.flatMap((query) => {
    const normalized = normalizeQuery(query.query);
    if (!normalized || seen.has(normalized)) return [];
    seen.add(normalized);
    return [{ ...query, query: normalized.slice(0, 60), purpose: query.purpose.trim().slice(0, 40) }];
  });
}

export function clampInteger(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function uniqueNormalizedStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim().replace(/\s+/g, " ")).filter(Boolean)));
}

function normalizeQuery(value: string) {
  return value.toLocaleLowerCase("ru-RU").replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
}
