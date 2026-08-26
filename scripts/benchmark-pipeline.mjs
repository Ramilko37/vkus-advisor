import { basketIntentJsonSchema, basketDraftJsonSchema } from "../src/schemas.ts";
import { intentPrompt } from "../src/prompts/intentPrompt.ts";
import { basketPrompt } from "../src/prompts/basketPrompt.ts";

const apiBase = process.env.BENCHMARK_API_BASE || `http://127.0.0.1:${process.env.PORT || 5174}`;
const live = process.env.BENCHMARK_LIVE === "1";
const queries = [
  "Собери ужины на 3 дня для двоих до 3000 рублей без грибов.",
  "Хочу обычную продуктовую корзину.",
  "Еда на четыре дня для одного человека, почти без готовки.",
  "Собери белковую корзину для тренировок на пять дней.",
  "Нужны лосось, овощи и крупа на три ужина.",
  "Завтраки на неделю для одного до 2500 рублей.",
  "Быстрые обеды на 2 дня без молочного.",
  "Корзина для семьи на выходные, чтобы почти не готовить.",
  "Недорогие перекусы и ужины на три дня.",
  "Рацион на 5 дней без свинины.",
  "Завтраки и ужины для двоих, побольше белка.",
  "Корзина с готовой едой на 3 дня.",
  "Дешёвые гарниры, овощи и курица.",
  "Ужины до 20 минут на неделю.",
  "Корзина без рыбы и грибов.",
  "Питание для тренировок без сладкого.",
  "Простая продуктовая корзина на 4 дня.",
  "Обеды в офис на неделю.",
  "Бюджетная корзина с завтраками.",
  "Собери быстрые блюда и перекусы на 2 дня.",
];

const mockIntent = {
  originalRequest: "",
  people: 1,
  days: 3,
  meals: ["ужин"],
  budgetRub: null,
  maxCookingMinutes: 30,
  excludedIngredients: [],
  preferences: [],
  readyFoodAllowed: true,
  priority: "balanced",
  needsClarification: false,
  clarificationQuestion: null,
  assumptions: [],
  searchQueries: [
    { query: "курица", purpose: "белок", sort: "popularity" },
    { query: "гречка", purpose: "гарнир", sort: "price_asc" },
    { query: "овощи", purpose: "овощи", sort: "popularity" },
  ],
};

const mockProducts = Array.from({ length: 12 }, (_, index) => ({
  xmlId: String(index + 1),
  name: `Товар ${index + 1}`,
  priceRub: 100 + index * 20,
  purpose: ["белок", "гарнир", "овощи"][index % 3],
}));

const mockBasket = {
  variants: ["balanced", "budget", "speed"].map((strategy) => ({
    strategy,
    items: mockProducts.slice(0, 4).map((product) => ({ xmlId: product.xmlId, quantity: 1, role: "main", reasonCode: "good_value" })),
  })),
};

const rows = [];
for (const [index, message] of queries.entries()) {
  const totalStart = performance.now();
  const intent = live ? await timed(() => openRouter("intent", intentPrompt, { previousIntent: null, selectedBasketSummary: null, newUserMessage: message }, basketIntentJsonSchema)) : fake(mockIntent);
  const searches = live ? await timed(() => searchCatalog(intent.result.data.searchQueries)) : fake(mockProducts);
  const searchProducts = live ? searches.result : searches.result.data;
  const candidateProducts = searchProducts.slice(0, 16);
  const basket = live ? await timed(() => openRouter("basket", basketPrompt, { intent: intent.result.data, candidateProducts }, basketDraftJsonSchema)) : fake(mockBasket);
  const measuredTotalMs = Math.round(performance.now() - totalStart);
  rows.push({
    request: index + 1,
    totalMs: live ? measuredTotalMs : intent.durationMs + searches.durationMs + basket.durationMs,
    intentMs: intent.durationMs,
    catalogMs: searches.durationMs,
    basketMs: basket.durationMs,
    searchQueryCount: intent.result.data.searchQueries.length,
    candidateCount: candidateProducts.length,
    candidatePayloadBytes: new TextEncoder().encode(JSON.stringify(candidateProducts)).length,
    intentTokens: intent.result.usage?.totalTokens || 0,
    basketTokens: basket.result.usage?.totalTokens || 0,
    fallback: Boolean(intent.result.fallbackModelUsed || basket.result.fallbackModelUsed),
    repair: false,
  });
}

printSummary(rows);

async function openRouter(stage, systemPrompt, userPayload, jsonSchema) {
  const response = await fetch(`${apiBase}/api/openrouter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage, systemPrompt, userPayload, jsonSchema, sessionId: `benchmark-${stage}` }),
  });
  if (!response.ok) throw new Error(`OpenRouter ${response.status}`);
  return response.json();
}

async function searchCatalog(queries) {
  const results = [];
  for (const query of queries.slice(0, 5)) {
    const response = await fetch(`${apiBase}/api/catalog/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
    });
    if (response.ok) results.push(...(await response.json()).products);
  }
  return results;
}

async function timed(callback) {
  const startedAt = performance.now();
  const result = await callback();
  return { result, durationMs: Math.round(performance.now() - startedAt) };
}

function fake(result) {
  return { result: { data: result, usage: { totalTokens: 0 } }, durationMs: 1 };
}

function printSummary(values) {
  const p50 = (key) => percentile(values.map((row) => row[key]), 0.5);
  const p95 = (key) => percentile(values.map((row) => row[key]), 0.95);
  console.table(values.map(({ request, totalMs, intentMs, catalogMs, basketMs, searchQueryCount, candidateCount, candidatePayloadBytes }) => ({
    request,
    totalMs,
    intentMs,
    catalogMs,
    basketMs,
    searchQueryCount,
    candidateCount,
    candidatePayloadBytes,
  })));
  console.log(JSON.stringify({
    mode: live ? "live" : "mock",
    p50TotalMs: p50("totalMs"),
    p95TotalMs: p95("totalMs"),
    p50IntentMs: p50("intentMs"),
    p50CatalogMs: p50("catalogMs"),
    p50BasketMs: p50("basketMs"),
    averageCandidateCount: average("candidateCount"),
    averagePayloadBytes: average("candidatePayloadBytes"),
    averageTokens: average("intentTokens") + average("basketTokens"),
    repairRate: 0,
    fallbackRate: values.filter((row) => row.fallback).length / values.length,
  }, null, 2));

  function average(key) {
    return Math.round(values.reduce((sum, row) => sum + row[key], 0) / values.length);
  }
}

function percentile(numbers, ratio) {
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}
