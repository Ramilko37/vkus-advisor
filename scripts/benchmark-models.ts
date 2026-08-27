import { openRouterStructuredRequest } from "../server.mjs";
import { basketPrompt } from "../src/prompts/basketPrompt.ts";
import { intentPrompt } from "../src/prompts/intentPrompt.ts";
import { basketDraftJsonSchema, basketDraftResponseSchema, basketIntentJsonSchema, basketIntentSchema } from "../src/schemas.ts";
import { hydrateAndValidateVariants } from "../src/services/basketValidation.ts";
import { toLlmCandidate, type LlmCandidateProduct } from "../src/services/candidateSelection.ts";
import type { BasketIntent, BasketVariantDraft, NormalizedProduct } from "../src/types/domain.ts";
import type { z } from "zod";

type Task = "intent" | "basket";
type FixtureKind = "intent" | "followup" | "basket" | "basket_restricted";

interface IntentExpect {
  people?: number;
  days?: number;
  budgetRub?: number | null;
  maxCookingMinutes?: number | null;
  priority?: BasketIntent["priority"];
  readyFoodAllowed?: boolean;
  mealsInclude?: string[];
  excludedInclude?: string[];
  preferencesInclude?: string[];
}

interface IntentFixture {
  kind: "intent" | "followup";
  name: string;
  message: string;
  previousIntent: BasketIntent | null;
  selectedBasketSummary: unknown;
  expect: IntentExpect;
}

interface BasketFixture {
  kind: "basket" | "basket_restricted";
  name: string;
  intent: BasketIntent;
  candidateProducts: LlmCandidateProduct[];
  sourceProducts: NormalizedProduct[];
}

interface CallMetrics {
  model: string;
  fixture: string;
  task: Task;
  kind: FixtureKind;
  latencyMs: number | null;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  finishReason?: string;
  jsonParseSuccess: boolean;
  zodSuccess: boolean;
  repairRequired: boolean;
  rateLimited: boolean;
  retryUsed: boolean;
  error?: string;
  unknownXmlIdCount?: number;
  hasBalanced?: boolean;
  hasBudget?: boolean;
  hasSpeed?: boolean;
  validVariantsCount?: number;
  searchQueryCount?: number;
  defaultsCorrect?: boolean;
  followUpPreservedPreviousIntent?: boolean;
}

interface ModelSummary {
  model: string;
  intentP50: number | null;
  basketP50: number | null;
  totalP95: number | null;
  jsonSuccessPct: number;
  zodSuccessPct: number;
  repairRatePct: number;
  unknownXmlIdCount: number;
  errors: number;
  rateLimits: number;
  score: number;
  intentScore: number;
  basketScore: number;
}

const models = unique((process.env.BENCHMARK_MODELS?.split(",").map((item) => item.trim()).filter(Boolean)) || [
  "openai/gpt-oss-120b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "openrouter/free",
  "dots-studio/dots-3-note-preview:free",
  "z-ai/glm-5.2:free",
]);
const fixtureLimit = Number(process.env.BENCHMARK_FIXTURE_LIMIT || 0);
const callDelayMs = Number(process.env.BENCHMARK_DELAY_MS || 1_500);
const retryDelayMs = Number(process.env.BENCHMARK_RETRY_DELAY_MS || 2_500);
const rateLimitDelayMs = Number(process.env.BENCHMARK_RATE_LIMIT_DELAY_MS || 20_000);
const apiKey = process.env.OPENROUTER_API_KEY;

if (!apiKey) {
  console.error("OPENROUTER_API_KEY is missing. Add it to .env or the shell environment.");
  process.exitCode = 1;
} else {
  const fixtures = fixtureLimit > 0 ? allFixtures().slice(0, fixtureLimit) : allFixtures();
  const rows: CallMetrics[] = [];
  console.log(`# OpenRouter model benchmark\n`);
  console.log(`Models: ${models.join(", ")}`);
  console.log(`Fixtures: ${fixtures.length} (${fixtureLimit ? "limited" : "full"}), concurrency: 1\n`);

  for (const model of models) {
    for (const fixture of fixtures) {
      const result = await runFixture(model, fixture);
      rows.push(result);
      console.log(`${statusIcon(result)} ${model} / ${fixture.name}: ${formatLatency(result.latencyMs)}${result.error ? ` (${result.error})` : ""}`);
      await sleep(callDelayMs);
    }
  }

  printReport(rows);
}

async function runFixture(model: string, fixture: IntentFixture | BasketFixture): Promise<CallMetrics> {
  const task: Task = fixture.kind === "intent" || fixture.kind === "followup" ? "intent" : "basket";
  const validator = task === "intent" ? basketIntentSchema : basketDraftResponseSchema;
  const systemPrompt = task === "intent" ? intentPrompt : basketPrompt;
  const jsonSchema = task === "intent" ? basketIntentJsonSchema : basketDraftJsonSchema;
  const userPayload = task === "intent"
    ? {
      previousIntent: (fixture as IntentFixture).previousIntent,
      selectedBasketSummary: (fixture as IntentFixture).selectedBasketSummary,
      newUserMessage: (fixture as IntentFixture).message.slice(0, 2000),
    }
    : {
      intent: (fixture as BasketFixture).intent,
      candidateProducts: (fixture as BasketFixture).candidateProducts,
    };

  let firstRateLimit = false;
  let firstRepair = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const startedAt = performance.now();
    try {
      const response = await openRouterStructuredRequest(apiKey || "", {
        stage: task,
        systemPrompt,
        userPayload,
        jsonSchema,
        sessionId: `model-benchmark-${task}`,
      }, {
        model,
        fallbackModel: null,
        formats: ["json_schema"],
        resolveAlias: false,
        silent: true,
        temperature: 0,
        maxTokens: task === "intent" ? 600 : 1800,
      });
      const latencyMs = Math.round(performance.now() - startedAt);
      firstRepair ||= Boolean(response.repairRequired);
      return inspectSuccess(model, fixture, task, validator, response.data, {
        latencyMs,
        promptTokens: response.usage?.promptTokens || 0,
        completionTokens: response.usage?.completionTokens || 0,
        reasoningTokens: response.usage?.reasoningTokens || 0,
        finishReason: response.finishReason,
        repairRequired: firstRepair,
        rateLimited: firstRateLimit,
        retryUsed: attempt > 0,
      });
    } catch (error) {
      const status = getErrorStatus(error);
      firstRateLimit ||= status === 429;
      if (attempt === 0) {
        await sleep(status === 429 ? rateLimitDelayMs : retryDelayMs);
        continue;
      }
      return inspectFailure(model, fixture, task, status, error, firstRateLimit, attempt > 0);
    }
  }
  return inspectFailure(model, fixture, task, undefined, new Error("Unknown benchmark failure"), firstRateLimit, true);
}

function inspectSuccess<T>(
  model: string,
  fixture: IntentFixture | BasketFixture,
  task: Task,
  validator: z.ZodType<T>,
  data: unknown,
  meta: Pick<CallMetrics, "latencyMs" | "promptTokens" | "completionTokens" | "reasoningTokens" | "finishReason" | "repairRequired" | "rateLimited" | "retryUsed">,
): CallMetrics {
  const parsed = validator.safeParse(data);
  const base: CallMetrics = {
    model,
    fixture: fixture.name,
    task,
    kind: fixture.kind,
    ...meta,
    jsonParseSuccess: true,
    zodSuccess: parsed.success,
  };
  if (!parsed.success) return { ...base, error: "zod_failed" };
  return task === "intent"
    ? { ...base, ...inspectIntent(parsed.data as BasketIntent, fixture as IntentFixture) }
    : { ...base, ...inspectBasket((parsed.data as { variants: BasketVariantDraft[] }).variants, fixture as BasketFixture) };
}

function inspectFailure(model: string, fixture: IntentFixture | BasketFixture, task: Task, status: number | undefined, error: unknown, rateLimited: boolean, retryUsed: boolean): CallMetrics {
  return {
    model,
    fixture: fixture.name,
    task,
    kind: fixture.kind,
    latencyMs: null,
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    jsonParseSuccess: false,
    zodSuccess: false,
    repairRequired: false,
    rateLimited,
    retryUsed,
    error: status === 429 ? "rate_limited" : shortError(error),
  };
}

function inspectIntent(intent: BasketIntent, fixture: IntentFixture) {
  const expected = matchesIntentExpectation(intent, fixture.expect);
  return {
    searchQueryCount: intent.searchQueries.length,
    defaultsCorrect: expected,
    followUpPreservedPreviousIntent: fixture.kind === "followup" ? expected : undefined,
  };
}

function inspectBasket(drafts: BasketVariantDraft[], fixture: BasketFixture) {
  const knownXmlIds = new Set(fixture.candidateProducts.map((product) => product.xmlId));
  const strategies = new Set(drafts.map((variant) => variant.strategy));
  const unknownXmlIdCount = drafts.reduce((sum, variant) => sum + variant.items.filter((item) => !knownXmlIds.has(item.xmlId)).length, 0);
  const validVariantsCount = hydrateAndValidateVariants(drafts, fixture.sourceProducts, fixture.intent).length;
  return {
    unknownXmlIdCount,
    hasBalanced: strategies.has("balanced"),
    hasBudget: strategies.has("budget"),
    hasSpeed: strategies.has("speed"),
    validVariantsCount,
  };
}

function printReport(rows: CallMetrics[]) {
  const summaries = summarize(rows);
  console.log("\n## Summary\n");
  console.log(markdownTable(
    ["Model", "Intent p50", "Basket p50", "Total p95", "JSON success %", "Zod success %", "Repair rate %", "Unknown xmlId", "Errors"],
    summaries.map((row) => [
      row.model,
      formatLatency(row.intentP50),
      formatLatency(row.basketP50),
      formatLatency(row.totalP95),
      pct(row.jsonSuccessPct),
      pct(row.zodSuccessPct),
      pct(row.repairRatePct),
      String(row.unknownXmlIdCount),
      row.rateLimits ? `${row.errors} (+${row.rateLimits} rate-limit)` : String(row.errors),
    ]),
  ));

  console.log("\n## Per Task\n");
  console.log(markdownTable(
    ["Model", "Task", "Calls", "p50", "p95", "Schema failure %", "Repair %", "Rate limits", "Errors", "Quality"],
    models.flatMap((model) => (["intent", "basket"] as Task[]).map((task) => taskSummary(rows.filter((row) => row.model === model && row.task === task), model, task))),
  ));

  const bestIntent = bestBy(summaries, (row) => row.intentScore);
  const bestBasket = bestBy(summaries, (row) => row.basketScore);
  const bestSingle = bestBy(summaries, (row) => row.score);
  console.log("\n## Recommendations\n");
  console.log(`Recommended intent model: ${bestIntent?.model || "n/a"}`);
  console.log(`Recommended basket model: ${bestBasket?.model || "n/a"}`);
  console.log(`Recommended single model: ${bestSingle?.model || "n/a"}`);
  console.log("\nScore weights: 35% latency, 30% schema reliability, 25% basket correctness, 10% stability.");
}

function summarize(rows: CallMetrics[]): ModelSummary[] {
  const byModel = models.map((model) => rows.filter((row) => row.model === model));
  const minP95 = Math.min(...byModel.map((items) => percentile(items.map((row) => row.latencyMs).filter(isNumber), 0.95)).filter(isNumber));
  const maxP95 = Math.max(...byModel.map((items) => percentile(items.map((row) => row.latencyMs).filter(isNumber), 0.95)).filter(isNumber));
  return byModel.map((items) => {
    const model = items[0]?.model || "";
    const p95 = percentile(items.map((row) => row.latencyMs).filter(isNumber), 0.95);
    const answered = items.filter((row) => row.error !== "rate_limited");
    const jsonSuccessPct = rate(answered, (row) => row.jsonParseSuccess);
    const zodSuccessPct = rate(answered, (row) => row.zodSuccess);
    const basketCorrectness = basketQuality(items.filter((row) => row.task === "basket"));
    const stability = 1 - (items.filter((row) => row.error && !row.rateLimited).length / Math.max(1, items.length));
    const latencyScore = latencyQuality(p95, minP95, maxP95);
    const schemaScore = (jsonSuccessPct + zodSuccessPct) / 2;
    const score = 0.35 * latencyScore + 0.3 * schemaScore + 0.25 * basketCorrectness + 0.1 * stability;
    return {
      model,
      intentP50: percentile(items.filter((row) => row.task === "intent").map((row) => row.latencyMs).filter(isNumber), 0.5),
      basketP50: percentile(items.filter((row) => row.task === "basket").map((row) => row.latencyMs).filter(isNumber), 0.5),
      totalP95: p95,
      jsonSuccessPct,
      zodSuccessPct,
      repairRatePct: rate(answered, (row) => row.repairRequired),
      unknownXmlIdCount: sum(items, "unknownXmlIdCount"),
      errors: items.filter((row) => row.error && !row.rateLimited).length,
      rateLimits: items.filter((row) => row.rateLimited).length,
      score,
      intentScore: taskScore(items.filter((row) => row.task === "intent"), latencyScore, "intent"),
      basketScore: taskScore(items.filter((row) => row.task === "basket"), latencyScore, "basket"),
    };
  }).sort((a, b) => b.score - a.score);
}

function taskScore(rows: CallMetrics[], latencyScore: number, task: Task) {
  const answered = rows.filter((row) => row.error !== "rate_limited");
  const schemaScore = (rate(answered, (row) => row.jsonParseSuccess) + rate(answered, (row) => row.zodSuccess)) / 2;
  const quality = task === "intent" ? intentQuality(rows) : basketQuality(rows);
  const stability = 1 - (rows.filter((row) => row.error && !row.rateLimited).length / Math.max(1, rows.length));
  return 0.35 * latencyScore + 0.3 * schemaScore + 0.25 * quality + 0.1 * stability;
}

function taskSummary(rows: CallMetrics[], model: string, task: Task) {
  return [
    model,
    task,
    String(rows.length),
    formatLatency(percentile(rows.map((row) => row.latencyMs).filter(isNumber), 0.5)),
    formatLatency(percentile(rows.map((row) => row.latencyMs).filter(isNumber), 0.95)),
    pct(1 - rate(rows.filter((row) => row.error !== "rate_limited"), (row) => row.zodSuccess)),
    pct(rate(rows.filter((row) => row.error !== "rate_limited"), (row) => row.repairRequired)),
    String(rows.filter((row) => row.rateLimited).length),
    String(rows.filter((row) => row.error && !row.rateLimited).length),
    pct(task === "intent" ? intentQuality(rows) : basketQuality(rows)),
  ];
}

function intentQuality(rows: CallMetrics[]) {
  if (!rows.length) return 0;
  return rows.reduce((sumValue, row) => {
    const queries = Math.min(1, Math.max(0, (row.searchQueryCount || 0) / 2));
    const defaults = row.defaultsCorrect === false ? 0 : 1;
    const followup = row.kind === "followup" ? (row.followUpPreservedPreviousIntent ? 1 : 0) : 1;
    return sumValue + (queries * 0.35 + defaults * 0.35 + followup * 0.3);
  }, 0) / rows.length;
}

function basketQuality(rows: CallMetrics[]) {
  if (!rows.length) return 0;
  return rows.reduce((sumValue, row) => {
    const strategies = [row.hasBalanced, row.hasBudget, row.hasSpeed].filter(Boolean).length / 3;
    const variants = (row.validVariantsCount || 0) / 3;
    const unknownPenalty = Math.min(1, (row.unknownXmlIdCount || 0) / 3);
    return sumValue + Math.max(0, strategies * 0.35 + variants * 0.45 + (1 - unknownPenalty) * 0.2);
  }, 0) / rows.length;
}

function allFixtures(): Array<IntentFixture | BasketFixture> {
  const intentFixtures: IntentFixture[] = [
    intentCase("Обычная корзина", "Хочу обычную продуктовую корзину.", null, { people: 1, days: 3, budgetRub: null, maxCookingMinutes: 30, priority: "balanced", readyFoodAllowed: true, mealsInclude: ["ужин"] }),
    intentCase("Ужины для двоих", "Собери ужины на 3 дня для двоих до 3000 рублей без грибов.", null, { people: 2, days: 3, budgetRub: 3000, excludedInclude: ["гриб"], mealsInclude: ["ужин"] }),
    intentCase("Завтраки неделя", "Завтраки на неделю для одного до 2500 рублей.", null, { people: 1, days: 7, budgetRub: 2500, mealsInclude: ["завтрак"] }),
    intentCase("Минимум готовки", "Еда на четыре дня для одного человека, почти без готовки.", null, { people: 1, days: 4, priority: "speed", readyFoodAllowed: true }),
    intentCase("Белковая корзина", "Собери белковую корзину для тренировок на пять дней.", null, { days: 5, preferencesInclude: ["бел"] }),
    intentCase("Семья выходные", "Корзина для семьи из четырёх человек на выходные, чтобы почти не готовить.", null, { people: 4, priority: "speed" }),
    intentCase("Без молочного", "Быстрые обеды на 2 дня без молочного.", null, { days: 2, excludedInclude: ["молоч"], mealsInclude: ["обед"] }),
    intentCase("Бюджетные перекусы", "Недорогие перекусы и ужины на три дня.", null, { days: 3, priority: "budget", mealsInclude: ["ужин", "перекус"] }),
    intentCase("Follow-up дешевле", "Сделай дешевле.", baseIntent({ budgetRub: 3200, people: 2, days: 3, excludedIngredients: ["грибы"] }), { people: 2, days: 3, budgetRub: 3200, priority: "budget", excludedInclude: ["гриб"] }),
    intentCase("Follow-up без молочного", "И ещё без молочного.", baseIntent({ people: 2, days: 3, budgetRub: 3000, excludedIngredients: ["грибы"] }), { people: 2, days: 3, budgetRub: 3000, excludedInclude: ["гриб", "молоч"] }),
    intentCase("Follow-up для троих", "Теперь для троих вместо двоих.", baseIntent({ people: 2, days: 4, budgetRub: 4500 }), { people: 3, days: 4, budgetRub: 4500 }),
    intentCase("Follow-up быстрее", "Пусть будет быстрее, максимум 15 минут.", baseIntent({ people: 1, days: 5, budgetRub: 3500, priority: "balanced" }), { people: 1, days: 5, budgetRub: 3500, priority: "speed", maxCookingMinutes: 15 }),
  ];
  const basketFixtures: BasketFixture[] = [
    basketCase("Basket ужины двое", baseIntent({ originalRequest: "Ужины на 3 дня для двоих до 3000", people: 2, days: 3, budgetRub: 3000, meals: ["ужин"] })),
    basketCase("Basket завтраки", baseIntent({ originalRequest: "Завтраки на неделю", days: 7, meals: ["завтрак"], budgetRub: 2500 })),
    basketCase("Basket белок", baseIntent({ originalRequest: "Белковая корзина для тренировок", days: 5, preferences: ["больше белка"], meals: ["обед", "ужин"] })),
    basketCase("Basket speed", baseIntent({ originalRequest: "Еда почти без готовки на 4 дня", days: 4, priority: "speed", maxCookingMinutes: 15 })),
    basketCase("Basket без грибов", baseIntent({ originalRequest: "Ужины без грибов", days: 3, budgetRub: 3200, excludedIngredients: ["грибы"] }), "basket_restricted"),
    basketCase("Basket без молочного", baseIntent({ originalRequest: "Обеды без молочного", days: 2, meals: ["обед"], excludedIngredients: ["молоко", "сыр", "творог"] }), "basket_restricted"),
    basketCase("Basket без рыбы", baseIntent({ originalRequest: "Корзина без рыбы и грибов", days: 3, excludedIngredients: ["рыба", "тунец", "лосось", "грибы"] }), "basket_restricted"),
    basketCase("Basket бюджет ограничения", baseIntent({ originalRequest: "Дешёвая корзина без сладкого", days: 4, budgetRub: 2200, priority: "budget", excludedIngredients: ["сахар"] }), "basket_restricted"),
  ];
  return [...intentFixtures, ...basketFixtures];
}

function intentCase(name: string, message: string, previousIntent: BasketIntent | null, expect: IntentExpect): IntentFixture {
  return { kind: previousIntent ? "followup" : "intent", name, message, previousIntent, selectedBasketSummary: null, expect };
}

function basketCase(name: string, intent: BasketIntent, kind: "basket" | "basket_restricted" = "basket"): BasketFixture {
  const sourceProducts = mockProducts();
  return { kind, name, intent, sourceProducts, candidateProducts: sourceProducts.map((product) => toLlmCandidate(product, intent)) };
}

function baseIntent(overrides: Partial<BasketIntent> = {}): BasketIntent {
  return {
    originalRequest: "Ужины на 3 дня",
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
    ...overrides,
  };
}

function mockProducts(): NormalizedProduct[] {
  return [
    product("bench-101", "Филе куриной грудки", 430, "белок", "600 г", "куриное филе", 23, 4.8),
    product("bench-102", "Фарш индейки охлаждённый", 390, "белок", "500 г", "мясо индейки", 21, 4.7),
    product("bench-103", "Яйца отварные, 2 шт", 129, "белок", "2 шт", "яйца куриные", 13, 4.6),
    product("bench-104", "Тунец филе натуральный", 295, "белок", "140 г", "тунец, соль", 24, 4.5),
    product("bench-105", "Гречневая крупа ядрица", 118, "гарнир", "900 г", "гречневая крупа", 12, 4.9),
    product("bench-106", "Рис басмати", 168, "гарнир", "500 г", "рис", 7, 4.7),
    product("bench-107", "Макароны из твёрдых сортов", 96, "гарнир", "450 г", "пшеница твёрдых сортов", 11, 4.6),
    product("bench-108", "Картофель молодой", 145, "гарнир", "1 кг", "картофель", 2, 4.5),
    product("bench-109", "Томаты розовые", 230, "овощи", "600 г", "томаты", 1, 4.6),
    product("bench-110", "Огурцы короткоплодные", 170, "овощи", "450 г", "огурцы", 1, 4.7),
    product("bench-111", "Салат Витаминный с лимонной заправкой", 225, "овощи", "250 г", "капуста, морковь, лимонная заправка", 2, 4.4),
    product("bench-112", "Овощи для жарки замороженные", 175, "овощи", "400 г", "брокколи, морковь, фасоль", 3, 4.3),
    product("bench-113", "Овсяные хлопья", 89, "завтрак", "500 г", "овсяные хлопья", 12, 4.8),
    product("bench-114", "Творог 5%", 135, "завтрак", "200 г", "молоко, закваска", 17, 4.7),
    product("bench-115", "Йогурт натуральный", 78, "завтрак", "170 г", "молоко, закваска", 5, 4.6),
    product("bench-116", "Сырники творожные", 219, "готовая еда", "300 г", "творог, мука, яйцо, сахар", 14, 4.5),
    product("bench-117", "Суп куриный готовый", 239, "готовая еда", "300 г", "курица, лапша, морковь", 8, 4.3),
    product("bench-118", "Паста с томатным соусом", 259, "готовая еда", "300 г", "макароны, томаты, сыр", 9, 4.3),
    product("bench-119", "Хумус классический", 139, "перекус", "200 г", "нут, тахини, масло", 8, 4.7),
    product("bench-120", "Снеки хрустящие из свеклы и моркови", 172, "перекус", "70 г", "свекла, морковь, масло", 3, 4.4),
  ];
}

function product(xmlId: string, name: string, priceRub: number, sourceQuery: string, weightLabel: string, composition: string, proteins: number, rating: number): NormalizedProduct {
  return { id: xmlId, xmlId, name, priceRub, sourceQuery, weightLabel, composition, proteins, rating, calories: Math.round(priceRub * 1.7), isDemo: true };
}

function matchesIntentExpectation(intent: BasketIntent, expect: IntentExpect) {
  if (expect.people !== undefined && intent.people !== expect.people) return false;
  if (expect.days !== undefined && intent.days !== expect.days) return false;
  if (expect.budgetRub !== undefined && intent.budgetRub !== expect.budgetRub) return false;
  if (expect.maxCookingMinutes !== undefined && intent.maxCookingMinutes !== expect.maxCookingMinutes) return false;
  if (expect.priority && intent.priority !== expect.priority) return false;
  if (expect.readyFoodAllowed !== undefined && intent.readyFoodAllowed !== expect.readyFoodAllowed) return false;
  if (expect.mealsInclude && !expect.mealsInclude.every((value) => includesText(intent.meals, value))) return false;
  if (expect.excludedInclude && !expect.excludedInclude.every((value) => includesText(intent.excludedIngredients, value))) return false;
  if (expect.preferencesInclude && !expect.preferencesInclude.every((value) => includesText(intent.preferences, value))) return false;
  return intent.searchQueries.length >= 2 && intent.searchQueries.length <= 5;
}

function includesText(values: string[], needle: string) {
  const normalized = needle.toLocaleLowerCase("ru-RU");
  return values.some((value) => value.toLocaleLowerCase("ru-RU").includes(normalized));
}

function latencyQuality(value: number | null, min: number, max: number) {
  if (value === null) return 0;
  if (max <= min) return 1;
  return 1 - ((value - min) / (max - min));
}

function percentile(values: number[], ratio: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}

function rate(rows: CallMetrics[], predicate: (row: CallMetrics) => boolean) {
  if (!rows.length) return 0;
  return rows.filter(predicate).length / rows.length;
}

function sum(rows: CallMetrics[], key: "unknownXmlIdCount") {
  return rows.reduce((total, row) => total + (row[key] || 0), 0);
}

function markdownTable(headers: string[], rows: string[][]) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function statusIcon(row: CallMetrics) {
  if (row.rateLimited) return "⏳";
  if (row.error) return "✗";
  return "✓";
}

function formatLatency(value: number | null) {
  return value === null ? "n/a" : `${value} ms`;
}

function pct(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

function bestBy<T>(items: T[], score: (item: T) => number) {
  return [...items].sort((a, b) => score(b) - score(a))[0];
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function isNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getErrorStatus(error: unknown) {
  if (typeof error === "object" && error && "status" in error && typeof (error as { status?: unknown }).status === "number") return (error as { status: number }).status;
  if (typeof error === "object" && error && "openRouterStatus" in error && typeof (error as { openRouterStatus?: unknown }).openRouterStatus === "number") return (error as { openRouterStatus: number }).openRouterStatus;
  return undefined;
}

function shortError(error: unknown) {
  const status = getErrorStatus(error);
  const message = error instanceof Error ? error.message : String(error);
  return `${status ? `${status}: ` : ""}${message}`.replace(/\s+/g, " ").slice(0, 120);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
