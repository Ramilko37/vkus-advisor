import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { AppError, BasketIntent, BasketItem, BasketVariant, CatalogClient, ChatMessage, NormalizedProduct, PipelineMetrics, UserProfile, WorkflowStage } from "../types/domain";
import { analyzeIntent, basketSummary, composeBaskets } from "../services/basketOrchestrator";
import { BrowserLlmClient, LlmProviderError, getSessionId } from "../services/openRouterClient";
import { createCatalogClient } from "../services/catalog";
import { applyFastIntentPatch, buildCatalogFingerprint, normalizeBasketIntent } from "../services/intentUtils";
import { measureStage } from "../services/pipelineMetrics";
import { validateBasketRequest } from "../services/requestCopy";
import { replaceBasketItem } from "../services/basketEditing";
import { DEFAULT_PROFILE } from "../services/profileRepository";

interface PlannerState {
  stage: WorkflowStage;
  messages: ChatMessage[];
  intent: BasketIntent | null;
  variants: BasketVariant[];
  selectedId: string | null;
  error: AppError | null;
  catalogMode: "live" | "demo" | "connecting";
  modelNames: string[];
  pendingMessage: string | null;
}

interface CandidatePool {
  intentFingerprint: string;
  products: NormalizedProduct[];
  createdAt: number;
}

type Action =
  | { type: "catalog"; mode: "live" | "demo" | "connecting" }
  | { type: "stage"; stage: WorkflowStage }
  | { type: "message"; message: ChatMessage }
  | { type: "intent"; intent: BasketIntent }
  | { type: "ready"; intent: BasketIntent; variants: BasketVariant[]; models: string[] }
  | { type: "select"; id: string | null }
  | { type: "items"; id: string; items: BasketItem[] }
  | { type: "error"; error: AppError; pendingMessage?: string }
  | { type: "clearError" };

const RESULTS_STORAGE_KEY = "vkusvill-advisor:last-results";

function createInitialState(): PlannerState {
  return {
    stage: "idle",
    messages: [{ id: crypto.randomUUID(), role: "assistant", createdAt: Date.now(), content: "Расскажите, какую задачу нужно решить с продуктами: на неделю, на семью, бюджет, предпочтения, ограничения — чем подробнее, тем лучше предложу варианты." }],
    intent: null,
    variants: [],
    selectedId: null,
    error: null,
    catalogMode: "connecting",
    modelNames: [],
    pendingMessage: null,
  };
}

function reducer(state: PlannerState, action: Action): PlannerState {
  switch (action.type) {
    case "catalog":
      return { ...state, catalogMode: action.mode };
    case "stage":
      return { ...state, stage: action.stage, error: null };
    case "message":
      return { ...state, messages: [...state.messages, action.message] };
    case "intent":
      return { ...state, intent: action.intent, stage: action.intent.needsClarification ? "clarifying" : state.stage };
    case "ready":
      return { ...state, stage: "ready", intent: action.intent, variants: action.variants, selectedId: null, modelNames: [...state.modelNames, ...action.models], error: null };
    case "select":
      return { ...state, selectedId: action.id };
    case "items":
      return { ...state, variants: state.variants.map((variant) => variant.id === action.id ? recalculate({ ...variant, items: action.items }) : variant) };
    case "error":
      return { ...state, stage: "error", error: action.error, pendingMessage: action.pendingMessage ?? state.pendingMessage };
    case "clearError":
      return { ...state, error: null };
    default:
      return state;
  }
}

export function useBasketPlanner(profile: UserProfile = DEFAULT_PROFILE) {
  const [state, dispatch] = useReducer(reducer, undefined, restorePlannerState);
  const catalogRef = useRef<CatalogClient | null>(null);
  const candidatePoolRef = useRef<CandidatePool | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const llm = useMemo(() => new BrowserLlmClient(), []);
  const sessionId = useMemo(() => getSessionId(), []);

  useEffect(() => {
    persistPlannerState(state);
  }, [state.catalogMode, state.intent, state.modelNames, state.selectedId, state.variants]);

  useEffect(() => {
    catalogRef.current = null;
    candidatePoolRef.current = null;
  }, [profile]);

  const runWorkflow = useCallback(async (message: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    const requestId = crypto.randomUUID();
    const startedAt = performance.now();
    activeRequestIdRef.current = requestId;
    abortRef.current = controller;
    const isActive = () => activeRequestIdRef.current === requestId;
    const metrics: PipelineMetrics = {
      requestId,
      totalMs: 0,
      intentMs: 0,
      catalogSearchMs: 0,
      catalogDetailsMs: 0,
      basketMs: 0,
      repairMs: 0,
      searchQueryCount: 0,
      catalogRequestCount: 0,
      catalogDetailsRequestCount: 0,
      rawCandidateCount: 0,
      finalCandidateCount: 0,
      candidatePayloadBytes: 0,
      intentRetryCount: 0,
      basketRetryCount: 0,
      intentRepairUsed: false,
      basketRepairUsed: false,
      catalogReused: false,
      fallbackModelUsed: false,
    };

    try {
      dispatch({ type: "stage", stage: "analyzing" });
      const fastIntent = state.intent ? applyFastIntentPatch(message, state.intent) : null;
      const intentResult = fastIntent
        ? { data: normalizeBasketIntent(fastIntent), model: "", retryCount: 0, fallbackModelUsed: false, usage: undefined }
        : (await measureStage(() => analyzeIntent(message, state.intent, basketSummary(selectedVariant(state)), llm, sessionId, controller.signal, profile))).result;
      metrics.intentMs = fastIntent ? 0 : intentResult.durationMs || 0;
      metrics.intentModel = intentResult.model || undefined;
      metrics.intentPromptTokens = intentResult.usage?.promptTokens;
      metrics.intentCompletionTokens = intentResult.usage?.completionTokens;
      metrics.intentReasoningTokens = intentResult.usage?.reasoningTokens;
      metrics.intentRetryCount = intentResult.retryCount || 0;
      metrics.fallbackModelUsed = Boolean(intentResult.fallbackModelUsed);
      if (!isActive()) return;
      dispatch({ type: "intent", intent: intentResult.data });
      if (intentResult.data.needsClarification && intentResult.data.clarificationQuestion) {
        dispatch({ type: "message", message: { id: crypto.randomUUID(), role: "assistant", content: intentResult.data.clarificationQuestion, createdAt: Date.now() } });
        return;
      }
      dispatch({ type: "stage", stage: "searching" });
      const catalog = catalogRef.current ?? await createCatalogClient(profile, controller.signal);
      catalogRef.current = catalog;
      dispatch({ type: "catalog", mode: catalog.mode });
      dispatch({ type: "stage", stage: "composing" });
      const fingerprint = buildCatalogFingerprint(intentResult.data);
      const reusablePool = candidatePoolRef.current?.intentFingerprint === fingerprint ? candidatePoolRef.current.products : undefined;
      const measuredBasket = await measureStage(() => composeBaskets(intentResult.data, catalog, llm, sessionId, controller.signal, reusablePool));
      const result = measuredBasket.result;
      metrics.basketMs = measuredBasket.durationMs - result.catalogSearchMs;
      metrics.catalogSearchMs = result.catalogSearchMs;
      metrics.searchQueryCount = intentResult.data.searchQueries.length;
      metrics.catalogRequestCount = result.catalogRequestCount;
      metrics.rawCandidateCount = result.rawCandidateCount;
      metrics.finalCandidateCount = result.finalCandidateCount;
      metrics.candidatePayloadBytes = result.candidatePayloadBytes;
      metrics.basketModel = result.models[0];
      metrics.basketPromptTokens = result.basketPromptTokens;
      metrics.basketCompletionTokens = result.basketCompletionTokens;
      metrics.basketReasoningTokens = result.basketReasoningTokens;
      metrics.basketRetryCount = result.basketRetryCount;
      metrics.catalogReused = result.catalogReused;
      metrics.fallbackModelUsed = metrics.fallbackModelUsed || result.basketFallbackModelUsed;
      candidatePoolRef.current = { intentFingerprint: fingerprint, products: result.candidates, createdAt: Date.now() };
      if (!isActive()) return;
      dispatch({ type: "ready", intent: result.intent, variants: result.variants, models: [intentResult.model, ...result.models] });
      dispatch({ type: "message", message: { id: crypto.randomUUID(), role: "assistant", content: "Готово: собрал три варианта корзины. Выберите подходящий и проверьте состав товаров перед оформлением.", createdAt: Date.now() } });
      metrics.totalMs = Math.round(performance.now() - startedAt);
      console.info("pipeline_metrics", metrics);
    } catch (error) {
      if (!isActive()) return;
      const appError = toAppError(error);
      dispatch({ type: "error", error: appError, pendingMessage: message });
    }
  }, [llm, profile, sessionId, state]);

  const submit = useCallback(async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    const validationError = state.intent ? null : validateBasketRequest(trimmed);
    if (validationError) {
      dispatch({ type: "error", error: { source: "validation", code: "short_prompt", message: validationError, recoverable: true }, pendingMessage: trimmed });
      return;
    }
    dispatch({ type: "message", message: { id: crypto.randomUUID(), role: "user", content: trimmed, createdAt: Date.now() } });
    await runWorkflow(trimmed);
  }, [runWorkflow, state.intent]);

  const retry = useCallback(() => {
    if (state.pendingMessage) void runWorkflow(state.pendingMessage);
  }, [runWorkflow, state.pendingMessage]);

  const reconnectCatalog = useCallback(async () => {
    dispatch({ type: "catalog", mode: "connecting" });
    const catalog = await createCatalogClient(profile);
    catalogRef.current = catalog;
    dispatch({ type: "catalog", mode: catalog.mode });
  }, [profile]);

  const mockResults = useCallback(() => {
    abortRef.current?.abort();
    candidatePoolRef.current = { intentFingerprint: buildCatalogFingerprint(mockIntent), products: mockCandidateProducts, createdAt: Date.now() };
    dispatch({ type: "catalog", mode: "live" });
    dispatch({ type: "ready", intent: mockIntent, variants: mockVariants, models: ["debug/mock"] });
  }, []);

  const createCart = useCallback(async () => {
    const variant = selectedVariant(state);
    if (!variant) return null;
    try {
      let catalog = catalogRef.current;
      if (!catalog) {
        dispatch({ type: "catalog", mode: "connecting" });
        catalog = await createCatalogClient(profile);
        catalogRef.current = catalog;
        dispatch({ type: "catalog", mode: catalog.mode });
      }
      if (catalog.mode === "demo") return null;
      dispatch({ type: "stage", stage: "creatingCart" });
      const url = await catalog.createCartLink(variant.items.map((item) => ({ xmlId: item.xmlId, quantity: item.quantity })));
      dispatch({ type: "stage", stage: "ready" });
      return url;
    } catch {
      dispatch({ type: "error", error: { source: "mcp", code: "cart", message: "Не удалось создать ссылку. Список товаров можно скопировать и использовать вручную.", recoverable: true } });
      return null;
    }
  }, [profile, state]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    activeRequestIdRef.current = null;
    dispatch({ type: "stage", stage: "idle" });
  }, []);

  const replaceItem = useCallback((variantId: string, xmlId: string) => {
    const variant = state.variants.find((item) => item.id === variantId);
    const pool = candidatePoolRef.current?.products.length ? candidatePoolRef.current.products : state.variants.flatMap((item) => item.items);
    if (!variant) return;
    dispatch({ type: "items", id: variantId, items: replaceBasketItem(variant.items, pool, xmlId) });
  }, [state.variants]);

  return {
    state,
    submit,
    retry,
    reconnectCatalog,
    mockResults,
    createCart,
    cancel,
    replaceItem,
    selectVariant: (id: string) => dispatch({ type: "select", id }),
    clearVariantSelection: () => dispatch({ type: "select", id: null }),
    updateItems: (id: string, items: BasketItem[]) => dispatch({ type: "items", id, items }),
  };
}

function restorePlannerState(): PlannerState {
  const initial = createInitialState();
  try {
    const raw = sessionStorage.getItem(RESULTS_STORAGE_KEY);
    if (!raw) return initial;
    const saved = JSON.parse(raw) as Partial<PlannerState> & { schemaVersion?: number };
    if (saved.schemaVersion !== 1 || !Array.isArray(saved.variants) || saved.variants.length === 0 || !saved.intent) return initial;
    const selectedId = typeof saved.selectedId === "string" && saved.variants.some((variant) => variant.id === saved.selectedId) ? saved.selectedId : null;
    return {
      ...initial,
      stage: "ready",
      messages: [
        ...initial.messages,
        { id: crypto.randomUUID(), role: "assistant", createdAt: Date.now(), content: "Вернул последнюю подборку. Можно выбрать вариант или собрать новую корзину." },
      ],
      intent: saved.intent,
      variants: saved.variants,
      selectedId,
      catalogMode: saved.catalogMode === "live" || saved.catalogMode === "demo" ? saved.catalogMode : "demo",
      modelNames: Array.isArray(saved.modelNames) ? saved.modelNames.filter((item): item is string => typeof item === "string") : [],
    };
  } catch {
    return initial;
  }
}

function persistPlannerState(state: PlannerState) {
  try {
    if (!state.intent || state.variants.length === 0) return;
    sessionStorage.setItem(RESULTS_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      intent: state.intent,
      variants: state.variants,
      selectedId: state.selectedId,
      catalogMode: state.catalogMode === "connecting" ? "demo" : state.catalogMode,
      modelNames: state.modelNames.slice(-4),
      updatedAt: Date.now(),
    }));
  } catch {
    // Storage can be unavailable in private modes; the app still works in-memory.
  }
}

function selectedVariant(state: PlannerState) {
  return state.variants.find((variant) => variant.id === state.selectedId) ?? null;
}

function recalculate(variant: BasketVariant): BasketVariant {
  const totalRub = Math.round(variant.items.reduce((sum, item) => sum + item.priceRub * item.quantity, 0));
  return { ...variant, totalRub, uniqueItemsCount: variant.items.length };
}

function toAppError(error: unknown): AppError {
  if (error instanceof LlmProviderError) {
    return { source: "llm", code: error.code, message: error.message, recoverable: true };
  }
  return { source: "application", code: "unknown", message: error instanceof Error ? error.message : "Что-то пошло не так.", recoverable: true };
}

const mockIntent: BasketIntent = {
  originalRequest: "Ужины на 3 дня для двоих до 3000 ₽, без грибов",
  people: 2,
  days: 3,
  meals: ["ужин"],
  budgetRub: 3000,
  maxCookingMinutes: 35,
  excludedIngredients: ["грибы"],
  preferences: ["простые блюда", "понятный состав"],
  readyFoodAllowed: true,
  priority: "balanced",
  needsClarification: false,
  clarificationQuestion: null,
  assumptions: ["Демо-подборка для отладки интерфейса"],
  searchQueries: [
    { query: "курица гарнир овощи", purpose: "ужин", sort: "popularity" },
    { query: "готовые блюда ужин", purpose: "быстрый вариант", sort: "rating" },
  ],
};

const mockBalancedItems: BasketItem[] = [
  mockItem("debug-101", "Салат \"Витаминный\" с лимонной заправкой", 149, 4, "Овощи", "Добавляет свежесть"),
  mockItem("debug-102", "Яйца отварные, 2 шт", 129, 4, "Белок", "Быстро закрывает белок"),
  mockItem("debug-103", "Тунец (скипджек) филе натуральный, 140 г", 219, 4, "Белок", "Не требует готовки"),
  mockItem("debug-104", "Снеки хрустящие из свеклы, тыквы и моркови", 96, 4, "Перекус", "Удобно добавить к ужину"),
];

const mockBudgetItems: BasketItem[] = [
  mockItem("debug-201", "Крупа гречневая ядрица, 900 г", 115, 2, "Гарнир", "Дешёвая база для ужинов"),
  mockItem("debug-202", "Картофель мытый, 1 кг", 89, 2, "Гарнир", "Сытный гарнир"),
  mockItem("debug-203", "Филе бедра куриного охлаждённое", 245, 2, "Белок", "Можно приготовить на несколько дней"),
  mockItem("debug-204", "Морковь свежая мытая", 72, 2, "Овощи", "Для гарнира и салата"),
  mockItem("debug-205", "Фасоль красная консервированная", 106, 2, "Белок", "Запасной белок без переплаты"),
];

const mockSpeedItems: BasketItem[] = [
  mockItem("debug-301", "Котлета куриная с картофельным пюре", 369, 2, "Готовая еда", "Готовый ужин"),
  mockItem("debug-302", "Суп куриный с лапшой", 289, 2, "Готовая еда", "Можно быстро разогреть"),
  mockItem("debug-303", "Овощи гриль запечённые", 259, 2, "Овощи", "Гарнир без подготовки"),
  mockItem("debug-304", "Салат овощной с зеленью", 189, 2, "Овощи", "Свежая добавка"),
];

const mockVariants: BasketVariant[] = [
  mockVariant("debug-balanced", "balanced", "Сбалансированная", "Цена и готовка в балансе.", mockBalancedItems, ["Оптимальный баланс бюджета и готовки"]),
  mockVariant("debug-budget", "budget", "Экономная", "Дешевле, но готовки может быть больше.", mockBudgetItems, ["Минимум стоимости"]),
  mockVariant("debug-speed", "speed", "Быстрая", "Дороже, зато быстрее.", mockSpeedItems, ["Меньше готовки"]),
].map((variant, _, variants) => {
  const balancedTotal = variants.find((item) => item.strategy === "balanced")?.totalRub ?? variant.totalRub;
  if (variant.strategy !== "budget" || variant.totalRub < balancedTotal) return variant;
  return { ...variant, title: "Альтернатива", summary: "По цене выше баланса, проверьте состав." };
});

const mockCandidateProducts: NormalizedProduct[] = [
  ...mockBalancedItems,
  ...mockBudgetItems,
  ...mockSpeedItems,
  mockItem("debug-401", "Индейка филе охлаждённое", 279, 2, "Белок", "Замена из найденных товаров"),
  mockItem("debug-402", "Рис жасмин длиннозёрный", 134, 2, "Гарнир", "Замена из найденных товаров"),
].map(toMockProduct);

function toMockProduct(item: BasketItem): NormalizedProduct {
  return {
    id: item.id,
    xmlId: item.xmlId,
    retailer: item.retailer,
    name: item.name,
    priceRub: item.priceRub,
    oldPriceRub: item.oldPriceRub,
    rating: item.rating,
    reviewsCount: item.reviewsCount,
    weightLabel: item.weightLabel,
    imageUrl: item.imageUrl,
    productUrl: item.productUrl,
    description: item.description,
    composition: item.composition,
    calories: item.calories,
    proteins: item.proteins,
    fats: item.fats,
    carbohydrates: item.carbohydrates,
    sourceQuery: item.sourceQuery,
    isDemo: item.isDemo,
  };
}

function mockItem(xmlId: string, name: string, priceRub: number, quantity: number, role: string, reason: string): BasketItem {
  return {
    id: xmlId,
    xmlId,
    name,
    priceRub,
    quantity,
    role,
    reason,
    sourceQuery: "debug",
    isDemo: true,
  };
}

function mockVariant(id: string, strategy: BasketVariant["strategy"], title: string, summary: string, items: BasketItem[], tradeoffs: string[]): BasketVariant {
  const totalRub = Math.round(items.reduce((sum, item) => sum + item.priceRub * item.quantity, 0));
  return {
    id,
    strategy,
    title,
    summary,
    tradeoffs,
    items,
    totalRub,
    uniqueItemsCount: items.length,
    warnings: [],
  };
}
