import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROFILE } from "../services/profileRepository";
import type { BasketIntent, NormalizedProduct, StructuredGenerationResult } from "../types/domain";
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

  it("recreates cached catalog client when delivery address changes", async () => {
    const profile = { ...DEFAULT_PROFILE, address: "Москва, старая 1" };
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
          variants: ["balanced", "budget", "speed"].map((strategy) => ({
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

    const { result } = renderHook(() => useBasketPlanner(profile));
    await act(async () => {
      await result.current.reconnectCatalog();
    });
    profile.address = "Москва, новая 2";
    await act(async () => {
      await result.current.submit("на 3 дня для двоих до 3000");
    });

    expect(mocks.createCatalogClient).toHaveBeenCalledTimes(2);
    expect(result.current.state.retailerResults).toContainEqual(expect.objectContaining({ retailer: "lenta", status: "ready" }));
    expect(result.current.state.variants.map((variant) => variant.retailer)).toEqual(["lenta", "lenta", "lenta"]);
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

  it("ignores old live results that only contain VkusVill baskets", () => {
    sessionStorage.setItem("vkusvill-advisor:last-results", JSON.stringify({
      schemaVersion: 10,
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
      variants: ["balanced", "budget", "speed"].map((strategy) => ({
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
      schemaVersion: 10,
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
        id: "vkusvill:balanced",
        retailer: "vkusvill",
        strategy: "balanced",
        title: "Сбалансированная",
        summary: "",
        tradeoffs: [],
        items: [],
        totalRub: 0,
        uniqueItemsCount: 0,
        warnings: [],
      }],
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
    maxCookingMinutes: 30,
    excludedIngredients: [],
    preferences: [],
    readyFoodAllowed: true,
    priority: "budget",
    needsClarification: false,
    clarificationQuestion: null,
    assumptions: [],
    searchQueries: [{ query: "курица", purpose: "белок", sort: "price_asc" }],
  };
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
