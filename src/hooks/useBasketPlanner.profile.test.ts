import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROFILE } from "../services/profileRepository";
import type { BasketIntent, BasketItem, BasketVariant, NormalizedProduct, Retailer, StructuredGenerationResult } from "../types/domain";
import { useBasketPlanner } from "./useBasketPlanner";

const mocks = vi.hoisted(() => ({
  createCatalogClient: vi.fn(),
  generateStructured: vi.fn(),
}));

vi.mock("../services/catalog", () => ({
  createCatalogClient: mocks.createCatalogClient,
}));

vi.mock("../services/openRouterClient", () => ({
  BrowserLlmClient: vi.fn(() => ({ generateStructured: mocks.generateStructured })),
  LlmProviderError: class LlmProviderError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  getSessionId: () => "test-session",
}));

describe("useBasketPlanner profile", () => {
  afterEach(() => {
    mocks.createCatalogClient.mockReset();
    mocks.generateStructured.mockReset();
    sessionStorage.clear();
  });

  it("passes the current profile to catalog reconnect", async () => {
    const profile = { ...DEFAULT_PROFILE, address: "Москва, Вавилова 19" };
    mocks.createCatalogClient.mockResolvedValue({
      mode: "live",
      searchProducts: vi.fn(),
      getProductDetails: vi.fn(),
      createCartLink: vi.fn(),
    });

    const { result } = renderHook(() => useBasketPlanner(profile));

    await act(async () => {
      await result.current.reconnectCatalog();
    });

    expect(mocks.createCatalogClient).toHaveBeenCalledWith(profile);
  });

  it("does not restore baskets from another retailer context", () => {
    const profile = { ...DEFAULT_PROFILE, address: "Москва, Тверская 1", lentaStoreId: "525" };
    sessionStorage.setItem("vkusvill-advisor:last-results", JSON.stringify({
      schemaVersion: 13,
      catalogContext: "москва, тверская 1:525:vkusvill",
      intent: testIntent(),
      variants: testCompareVariants("vkusvill"),
      retailerResults: [{ retailer: "vkusvill", status: "ready", candidateCount: 4, selectedCandidateCount: 4, variantCount: 3 }],
      selectedId: null,
      catalogMode: "live",
      modelNames: [],
    }));

    const { result } = renderHook(() => useBasketPlanner(profile, ["lenta"]));

    expect(result.current.state.stage).toBe("idle");
    expect(result.current.state.variants).toEqual([]);
  });

  it("restores a selected basket after the user removes products", () => {
    const profile = { ...DEFAULT_PROFILE, address: "Москва, Тверская 1", lentaStoreId: "525" };
    const variants = testCompareVariants("lenta").map((variant) => ({ ...variant, items: variant.items.slice(0, 1), totalRub: 100, uniqueItemsCount: 1 }));
    sessionStorage.setItem("vkusvill-advisor:last-results", JSON.stringify({
      schemaVersion: 13,
      catalogContext: "москва, тверская 1:525:lenta",
      intent: testIntent(),
      variants,
      retailerResults: [{ retailer: "lenta", status: "ready", candidateCount: 4, selectedCandidateCount: 4, variantCount: 3 }],
      selectedId: "lenta:economy",
      catalogMode: "live",
      modelNames: [],
    }));

    const { result } = renderHook(() => useBasketPlanner(profile, ["lenta"]));

    expect(result.current.state.stage).toBe("ready");
    expect(result.current.state.selectedId).toBe("lenta:economy");
    expect(result.current.state.variants.every((variant) => variant.items.length === 1)).toBe(true);
  });

  it("clears visible baskets when the resolved retailer set changes", () => {
    const profile = { ...DEFAULT_PROFILE, address: "Москва, Тверская 1", lentaStoreId: "525" };
    const { result, rerender } = renderHook(
      ({ retailers }) => useBasketPlanner(profile, retailers),
      { initialProps: { retailers: ["lenta", "pyaterochka"] as Retailer[] } },
    );
    act(() => result.current.mockResults());

    rerender({ retailers: ["lenta"] as Retailer[] });

    expect(result.current.state.stage).toBe("idle");
    expect(result.current.state.variants).toEqual([]);
  });

  it("ignores an old workflow that finishes after the retailer context changes", async () => {
    const profile = { ...DEFAULT_PROFILE, address: "Москва, Тверская 1", lentaStoreId: "525" };
    let finishCatalog!: (client: unknown) => void;
    mocks.generateStructured.mockImplementation(async <T,>(options: { stage: "intent" | "basket" }): Promise<StructuredGenerationResult<T>> => ({
      model: "test-model",
      data: (options.stage === "intent" ? testIntent() : {
        variants: ["balanced", "economy", "fast"].map((strategy) => ({
          strategy,
          items: testProducts("lenta").map(({ xmlId }) => ({ xmlId, quantity: 1, role: "main", reasonCode: "budget_fit" })),
        })),
      }) as T,
    }));
    mocks.createCatalogClient.mockImplementation(() => new Promise((resolve) => { finishCatalog = resolve; }));
    const { result, rerender } = renderHook(
      ({ retailers }) => useBasketPlanner(profile, retailers),
      { initialProps: { retailers: ["lenta"] as Retailer[] } },
    );

    let workflow!: Promise<void>;
    act(() => { workflow = result.current.submit("на 3 дня для двоих до 3000"); });
    await waitFor(() => expect(mocks.createCatalogClient).toHaveBeenCalled());
    rerender({ retailers: ["pyaterochka"] as Retailer[] });
    await act(async () => {
      finishCatalog({
        mode: "live",
        searchProducts: vi.fn().mockResolvedValue(testProducts("lenta")),
        getProductDetails: vi.fn(),
        createCartLink: vi.fn(),
      });
      await workflow;
    });

    expect(result.current.state.stage).toBe("idle");
    expect(result.current.state.variants).toEqual([]);
  });

  it("ignores a second submit while generation is active", async () => {
    const profile = { ...DEFAULT_PROFILE, address: "Москва, Тверская 1" };
    const resolveIntent: Array<(value: StructuredGenerationResult<BasketIntent>) => void> = [];
    mocks.generateStructured.mockImplementation(<T,>(options: { stage: "intent" | "basket" }) => {
      if (options.stage === "intent") {
        return new Promise<StructuredGenerationResult<T>>((resolve) => {
          resolveIntent.push(resolve as (value: StructuredGenerationResult<BasketIntent>) => void);
        });
      }
      return Promise.reject(new Error("basket generation must not start after cancellation"));
    });
    const { result } = renderHook(() => useBasketPlanner(profile));

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.submit("ужины на 3 дня для двоих до 3000");
      second = result.current.submit("продукты на неделю для троих");
    });

    expect(mocks.generateStructured).toHaveBeenCalledTimes(1);
    act(() => result.current.cancel());
    await act(async () => {
      resolveIntent.forEach((resolve) => resolve({ model: "test-model", data: testIntent() }));
      await Promise.all([first, second]);
    });
  });

  it("moves an aborted workflow to canceled without surfacing an error", async () => {
    const profile = { ...DEFAULT_PROFILE, address: "Москва, Тверская 1" };
    let resolveIntent!: (value: StructuredGenerationResult<BasketIntent>) => void;
    mocks.generateStructured.mockImplementation(<T,>() => new Promise<StructuredGenerationResult<T>>((resolve) => {
      resolveIntent = resolve as (value: StructuredGenerationResult<BasketIntent>) => void;
    }));
    const { result } = renderHook(() => useBasketPlanner(profile));
    let workflow!: Promise<void>;
    act(() => { workflow = result.current.submit("ужины на 3 дня для двоих до 3000"); });

    act(() => result.current.cancel());

    expect(result.current.state.stage).toBe("canceled");
    expect(result.current.state.error).toBeNull();
    await act(async () => {
      resolveIntent({ model: "test-model", data: testIntent() });
      await workflow;
    });
  });

  it("clears the current basket and its persisted copy for a new search", async () => {
    const { result } = renderHook(() => useBasketPlanner(DEFAULT_PROFILE));

    act(() => result.current.mockResults());
    await waitFor(() => expect(sessionStorage.getItem("vkusvill-advisor:last-results")).not.toBeNull());

    act(() => (result.current as typeof result.current & { reset?: () => void }).reset?.());

    expect(result.current.state.stage).toBe("idle");
    expect(result.current.state.intent).toBeNull();
    expect(result.current.state.variants).toEqual([]);
    await waitFor(() => expect(sessionStorage.getItem("vkusvill-advisor:last-results")).toBeNull());
  });

  it("invalidates saved results as soon as a changed request starts", async () => {
    const profile = { ...DEFAULT_PROFILE, address: "Москва, Тверская 1" };
    let resolveIntent!: (value: StructuredGenerationResult<BasketIntent>) => void;
    mocks.generateStructured.mockImplementation(<T,>() => new Promise<StructuredGenerationResult<T>>((resolve) => {
      resolveIntent = resolve as (value: StructuredGenerationResult<BasketIntent>) => void;
    }));
    const { result } = renderHook(() => useBasketPlanner(profile));
    act(() => result.current.mockResults());
    await waitFor(() => expect(sessionStorage.getItem("vkusvill-advisor:last-results")).not.toBeNull());

    let workflow!: Promise<void>;
    act(() => { workflow = result.current.submit("другой набор продуктов на неделю"); });

    expect(result.current.state.stage).toBe("analyzing");
    expect(result.current.state.variants).toEqual([]);
    await waitFor(() => expect(sessionStorage.getItem("vkusvill-advisor:last-results")).toBeNull());
    act(() => result.current.cancel());
    await act(async () => {
      resolveIntent({ model: "test-model", data: testIntent() });
      await workflow;
    });
  });

  it("requires address before building live retailer baskets", async () => {
    const { result } = renderHook(() => useBasketPlanner(DEFAULT_PROFILE));

    await act(async () => {
      await result.current.submit("на 3 дня для двоих до 3000");
    });

    expect(result.current.state.stage).toBe("error");
    expect(result.current.state.error).toEqual(expect.objectContaining({
      code: "missing_address",
      message: "Добавьте адрес доставки в профиль: без него Лента не выбирает магазин и не возвращает товары.",
    }));
    expect(mocks.createCatalogClient).not.toHaveBeenCalled();
  });

  it("maps catalog failures to safe recoverable copy", async () => {
    const profile = { ...DEFAULT_PROFILE, address: "Москва, Вавилова 19" };
    mocks.generateStructured.mockResolvedValue({ model: "test-model", data: testIntent() });
    mocks.createCatalogClient.mockRejectedValue(new Error("HTTP 503 upstream payload"));
    const { result } = renderHook(() => useBasketPlanner(profile));

    await act(async () => {
      await result.current.submit("на 3 дня для двоих до 3000");
    });

    expect(result.current.state.stage).toBe("error");
    expect(result.current.state.error).toEqual(expect.objectContaining({
      code: "catalog_unavailable",
      message: "Каталог временно недоступен.",
      recoverable: true,
    }));
    expect(result.current.state.error?.message).not.toMatch(/HTTP|503|payload/i);
  });

  it("recreates cached catalog client when delivery address changes", async () => {
    const profile = { ...DEFAULT_PROFILE, address: "Москва, старая 1", lentaStoreId: "525" };
    const intent = testIntent();
    const oldProducts = testProducts("vkusvill");
    const newProducts = testProducts("lenta");
    mocks.generateStructured.mockImplementation(async <T,>(options: { stage: "intent" | "basket"; userPayload: unknown }): Promise<StructuredGenerationResult<T>> => {
      if (options.stage === "intent") return { model: "test-model", data: intent as T };
      const payload = options.userPayload as { candidateProducts: Array<{ xmlId: string }> };
      const ids = payload.candidateProducts.map((product) => product.xmlId);
      return {
        model: "test-model",
        data: {
          variants: ["balanced", "economy", "fast"].map((strategy) => ({
            strategy,
            items: ids.map((xmlId) => ({ xmlId, quantity: 1, role: "main", reasonCode: "budget_fit" })),
          })),
        } as T,
      };
    });
    mocks.createCatalogClient.mockImplementation(async (clientProfile: typeof profile) => {
      const addressAtCreation = clientProfile.address;
      return {
        mode: "live",
        async searchProducts() { return addressAtCreation.includes("новая") ? newProducts : oldProducts; },
        async getProductDetails() { return {}; },
        async createCartLink() { return ""; },
      };
    });

    const { result, rerender } = renderHook(
      ({ currentProfile }) => useBasketPlanner(currentProfile),
      { initialProps: { currentProfile: profile } },
    );
    await act(async () => {
      await result.current.reconnectCatalog();
    });
    rerender({ currentProfile: { ...profile, address: "Москва, новая 2" } });
    await act(async () => {
      await result.current.submit("на 3 дня для двоих до 3000");
    });

    expect(mocks.createCatalogClient).toHaveBeenCalledTimes(2);
    expect(result.current.state.retailerResults).toContainEqual(expect.objectContaining({ retailer: "lenta", status: "ready" }));
    expect(result.current.state.variants.map((variant) => variant.retailer)).toEqual(["lenta", "lenta", "lenta"]);
  });

  it("validates a Lenta basket and returns its refreshed list without creating a VkusVill cart", async () => {
    const profile = { ...DEFAULT_PROFILE, address: "Москва, Тверская 1", lentaStoreId: "525" };
    const item = {
      id: "lenta:100",
      xmlId: "lenta:100",
      retailer: "lenta" as const,
      name: "Молоко Лента",
      priceRub: 100,
      sourceQuery: "молоко",
      isDemo: false,
      quantity: 2,
      role: "breakfast",
      reason: "Подходит под запрос",
    };
    const savedVariants = testCompareVariants("lenta", item);
    sessionStorage.setItem("vkusvill-advisor:last-results", JSON.stringify({
      schemaVersion: 13,
      catalogContext: "москва, тверская 1:525:",
      intent: testIntent(),
      variants: savedVariants,
      retailerResults: [{ retailer: "lenta", status: "ready", candidateCount: 4, selectedCandidateCount: 4, variantCount: 3 }],
      selectedId: "lenta:balanced",
      catalogMode: "live",
      modelNames: [],
    }));
    const validateBasketItems = vi.fn().mockResolvedValue({
      products: savedVariants[0].items.map((savedItem) => ({ ...savedItem, priceRub: savedItem.xmlId === item.xmlId ? 125 : savedItem.priceRub, quantity: undefined, role: undefined, reason: undefined })),
      unavailableXmlIds: [],
      changedPrices: [{ xmlId: item.xmlId, oldPriceRub: 100, newPriceRub: 125 }],
    });
    const createCartLink = vi.fn();
    mocks.createCatalogClient.mockResolvedValue({
      mode: "live",
      searchProducts: vi.fn(),
      getProductDetails: vi.fn(),
      validateBasketItems,
      createCartLink,
    });

    const { result } = renderHook(() => useBasketPlanner(profile));
    let checkout: Awaited<ReturnType<typeof result.current.createCart>>;
    await act(async () => {
      checkout = await result.current.createCart();
    });

    expect(validateBasketItems).toHaveBeenCalledWith(savedVariants[0].items.map((savedItem) => ({ xmlId: savedItem.xmlId, quantity: savedItem.quantity, priceRub: savedItem.priceRub })));
    expect(createCartLink).not.toHaveBeenCalled();
    expect(checkout!).toEqual({
      url: "https://lenta.com/basket/",
      items: expect.arrayContaining([expect.objectContaining({ xmlId: "lenta:100", quantity: 2, priceRub: 125, role: "breakfast", reason: "Подходит под запрос" })]),
    });
    expect(result.current.state.variants[0].totalRub).toBe(savedVariants[0].totalRub + 50);
    expect(result.current.state.variants[0].validation.status).toBe("validated");
  });

  it("marks Lenta validation stale after a manual basket edit", () => {
    const item: BasketItem = {
      id: "lenta:100",
      xmlId: "lenta:100",
      retailer: "lenta",
      name: "Молоко Лента",
      priceRub: 100,
      sourceQuery: "молоко",
      isDemo: false,
      quantity: 1,
      role: "breakfast",
      reason: "Подходит под запрос",
    };
    sessionStorage.setItem("vkusvill-advisor:last-results", JSON.stringify({
      schemaVersion: 13,
      catalogContext: "::",
      intent: testIntent(),
      variants: testCompareVariants("lenta", item),
      retailerResults: [{ retailer: "lenta", status: "ready", candidateCount: 4, selectedCandidateCount: 4, variantCount: 3 }],
      selectedId: null,
      catalogMode: "live",
      modelNames: [],
    }));

    const { result } = renderHook(() => useBasketPlanner(DEFAULT_PROFILE));
    act(() => result.current.updateItems("lenta:balanced", [{ ...item, quantity: 2 }]));

    expect(result.current.state.variants[0].validation).toEqual({ status: "stale", checkedAt: null });
  });

  it("rejects Lenta checkout when validation omits requested products", async () => {
    const profile = { ...DEFAULT_PROFILE, address: "Москва, Тверская 1", lentaStoreId: "525" };
    const item: BasketItem = {
      id: "lenta:100",
      xmlId: "lenta:100",
      retailer: "lenta",
      name: "Молоко Лента",
      priceRub: 100,
      sourceQuery: "молоко",
      isDemo: false,
      quantity: 1,
      role: "breakfast",
      reason: "Подходит под запрос",
    };
    sessionStorage.setItem("vkusvill-advisor:last-results", JSON.stringify({
      schemaVersion: 13,
      catalogContext: "москва, тверская 1:525:",
      intent: testIntent(),
      variants: testCompareVariants("lenta", item),
      retailerResults: [{ retailer: "lenta", status: "ready", candidateCount: 4, selectedCandidateCount: 4, variantCount: 3 }],
      selectedId: "lenta:balanced",
      catalogMode: "live",
      modelNames: [],
    }));
    mocks.createCatalogClient.mockResolvedValue({
      mode: "live",
      searchProducts: vi.fn(),
      getProductDetails: vi.fn(),
      validateBasketItems: vi.fn().mockResolvedValue({ products: [], unavailableXmlIds: [], changedPrices: [] }),
      createCartLink: vi.fn(),
    });

    const { result } = renderHook(() => useBasketPlanner(profile));
    let checkout: Awaited<ReturnType<typeof result.current.createCart>>;
    await act(async () => {
      checkout = await result.current.createCart();
    });

    expect(checkout!).toBeNull();
    expect(result.current.state.variants[0].validation).toEqual({ status: "failed", checkedAt: null });
    expect(result.current.state.error?.code).toBe("cart");
  });

  it("ignores saved results from stale schemas", () => {
    sessionStorage.setItem("vkusvill-advisor:last-results", JSON.stringify({
      schemaVersion: 4,
      intent: {
        originalRequest: "ужин",
        people: 1,
        days: 1,
        meals: ["ужин"],
        budgetRub: null,
        maxCookingMinutes: null,
        excludedIngredients: [],
        preferences: [],
        readyFoodAllowed: true,
        priority: "balanced",
        needsClarification: false,
        clarificationQuestion: null,
        assumptions: [],
        searchQueries: [{ query: "ужин", purpose: "ужин", sort: "popularity" }],
      },
      variants: [{
        id: "balanced",
        strategy: "balanced",
        title: "Сбалансированная",
        summary: "",
        tradeoffs: [],
        items: [],
        totalRub: 0,
        uniqueItemsCount: 0,
        warnings: [],
      }],
      selectedId: null,
      catalogMode: "live",
      modelNames: [],
    }));

    const { result } = renderHook(() => useBasketPlanner(DEFAULT_PROFILE));

    expect(result.current.state.stage).toBe("idle");
    expect(result.current.state.variants).toEqual([]);
  });

  it("ignores current-version results that do not satisfy the Compare contract", () => {
    sessionStorage.setItem("vkusvill-advisor:last-results", JSON.stringify({
      schemaVersion: 13,
      catalogContext: "::",
      intent: testIntent(),
      variants: [{
        id: "demo:balanced",
        retailer: "demo",
        storeId: null,
        strategy: "balanced",
        title: "Сбалансированная",
        items: [],
        totalRub: 0,
        uniqueItemsCount: 0,
        warnings: [],
      }],
      selectedId: null,
      catalogMode: "demo",
      modelNames: [],
    }));

    const { result } = renderHook(() => useBasketPlanner(DEFAULT_PROFILE));

    expect(result.current.state.stage).toBe("idle");
    expect(result.current.state.variants).toEqual([]);
  });

  it("ignores old live results that only contain VkusVill baskets", () => {
    sessionStorage.setItem("vkusvill-advisor:last-results", JSON.stringify({
      schemaVersion: 11,
      intent: {
        originalRequest: "ужин",
        people: 1,
        days: 1,
        meals: ["ужин"],
        budgetRub: null,
        budgetIsHard: false,
        maxCookingMinutes: null,
        excludedIngredients: [],
        dietaryRestrictions: [],
        preferences: [],
        readyFoodAllowed: true,
        priority: "balanced",
        needsClarification: false,
        clarificationQuestion: null,
        assumptions: [],
        searchQueries: [{ query: "ужин", purpose: "ужин", sort: "popularity" }],
      },
      variants: ["balanced", "economy", "fast"].map((strategy) => ({
        id: `vkusvill:${strategy}`,
        retailer: "vkusvill",
        strategy,
        title: "Сбалансированная",
        summary: "",
        tradeoffs: [],
        items: [],
        totalRub: 0,
        uniqueItemsCount: 0,
        warnings: [],
      })),
      selectedId: null,
      catalogMode: "live",
      modelNames: [],
    }));

    const { result } = renderHook(() => useBasketPlanner(DEFAULT_PROFILE));

    expect(result.current.state.stage).toBe("idle");
    expect(result.current.state.variants).toEqual([]);
  });

  it("restores retailer diagnostics from saved results", () => {
    sessionStorage.setItem("vkusvill-advisor:last-results", JSON.stringify({
      schemaVersion: 13,
      catalogContext: "::",
      intent: testIntent(),
      variants: testCompareVariants("vkusvill"),
      retailerResults: [
        { retailer: "vkusvill", status: "ready", candidateCount: 12, selectedCandidateCount: 12, variantCount: 3 },
        { retailer: "lenta", status: "failed", candidateCount: 16, selectedCandidateCount: 16, variantCount: 0, message: "Не удалось собрать три валидные корзины." },
      ],
      selectedId: null,
      catalogMode: "live",
      modelNames: [],
    }));

    const { result } = renderHook(() => useBasketPlanner(DEFAULT_PROFILE));

    expect(result.current.state.stage).toBe("ready");
    expect(result.current.state.retailerResults).toEqual([
      expect.objectContaining({ retailer: "vkusvill", status: "ready" }),
      expect.objectContaining({ retailer: "lenta", status: "failed", candidateCount: 16 }),
    ]);
  });
});

function testIntent(): BasketIntent {
  return {
    originalRequest: "на 3 дня для двоих до 3000",
    people: 2,
    days: 3,
    meals: ["ужин"],
    budgetRub: 3000,
    budgetIsHard: true,
    maxCookingMinutes: 30,
    excludedIngredients: [],
    dietaryRestrictions: [],
    preferences: [],
    readyFoodAllowed: true,
    priority: "budget",
    needsClarification: false,
    clarificationQuestion: null,
    assumptions: [],
    searchQueries: [
      { query: "курица", purpose: "белок", sort: "price_asc" },
      { query: "овощи", purpose: "гарнир", sort: "price_asc" },
    ],
  };
}

function testCompareVariants(retailer: "vkusvill" | "lenta", item?: BasketItem): BasketVariant[] {
  const strategies = ["balanced", "economy", "fast"] as const;
  const items = item
    ? [item, ...[1, 2, 3].map((index): BasketItem => ({ ...item, id: `${item.id}:${index}`, xmlId: `${item.xmlId}:${index}`, quantity: 1 }))]
    : [1, 2, 3, 4].map((index): BasketItem => ({
      id: `${retailer}:${index}`,
      xmlId: `${retailer}:${index}`,
      retailer,
      name: `Товар ${index}`,
      priceRub: 100,
      quantity: 1,
      role: "main",
      reason: "Подходит под запрос",
      sourceQuery: "ужин",
      isDemo: false,
    }));
  const totalRub = items.reduce((sum, basketItem) => sum + basketItem.priceRub * basketItem.quantity, 0);
  return strategies.map((strategy, index) => ({
    id: `${retailer}:${strategy}`,
    retailer,
    storeId: retailer === "lenta" ? "525" : null,
    strategy,
    title: strategy === "balanced" ? "Сбалансированная" : strategy === "economy" ? "Экономная" : "Быстрая",
    strategyDescription: "Описание стратегии",
    coverage: { people: 2, days: 3, meals: [{ type: "ужин", count: 3 }], totalMeals: 3, label: "3 ужина · 2 человека" },
    constraints: { exclusions: [], dietaryRestrictions: [], hardBudgetRub: 3000 },
    prep: { minutes: strategy === "fast" ? 10 : strategy === "economy" ? 45 : 30, complexity: "medium", label: "готовка: средняя" },
    tradeoffSummary: "Компромисс стратегии.",
    deltaToBalanced: { priceRub: 0 },
    score: index === 0 ? 100 : 80 - index,
    recommended: index === 0,
    validation: retailer === "lenta"
      ? { status: "validated", checkedAt: "2026-09-02T10:00:00.000Z" }
      : { status: "not_supported", checkedAt: null },
    items,
    totalRub,
    uniqueItemsCount: items.length,
    warnings: [],
  }));
}

function testProducts(retailer: "vkusvill" | "lenta"): NormalizedProduct[] {
  return [1, 2, 3, 4].map((index) => ({
    id: `${retailer}:${index}`,
    xmlId: `${retailer}:${index}`,
    retailer,
    name: `${retailer} товар ${index}`,
    priceRub: 100 + index,
    sourceQuery: "курица",
    isDemo: false,
  }));
}
