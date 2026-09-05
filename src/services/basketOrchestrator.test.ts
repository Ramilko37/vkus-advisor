import { describe, expect, it, vi } from "vitest";
import { analyzeIntent, composeBaskets } from "./basketOrchestrator";
import type { BasketIntent, CatalogClient, NormalizedProduct, StructuredGenerationResult } from "../types/domain";

const intent: BasketIntent = {
  originalRequest: "ужины",
  people: 2,
  days: 3,
  meals: ["ужин"],
  budgetRub: 3000,
  maxCookingMinutes: 20,
  excludedIngredients: [],
  preferences: [],
  readyFoodAllowed: true,
  priority: "balanced",
  needsClarification: false,
  clarificationQuestion: null,
  assumptions: [],
  searchQueries: [{ query: "курица", purpose: "белок", sort: "popularity" }],
};

const products: NormalizedProduct[] = [
  { id: "1", xmlId: "1", name: "Курица", priceRub: 300, sourceQuery: "курица", isDemo: true },
  { id: "2", xmlId: "2", name: "Гречка", priceRub: 100, sourceQuery: "курица", isDemo: true },
  { id: "3", xmlId: "3", name: "Овощи", priceRub: 150, sourceQuery: "курица", isDemo: true },
  { id: "4", xmlId: "4", name: "Суп", priceRub: 220, sourceQuery: "курица", isDemo: true },
  { id: "5", xmlId: "5", name: "Плов", priceRub: 250, sourceQuery: "курица", isDemo: true },
  { id: "6", xmlId: "6", name: "Салат", priceRub: 120, sourceQuery: "курица", isDemo: true },
];

const catalog: CatalogClient = {
  mode: "demo",
  async connect() {},
  async searchProducts() { return products; },
  async getProductDetails() { return {}; },
  async createCartLink() { return ""; },
};

describe("composeBaskets", () => {
  it("shows three explicitly unverified Eats previews per retailer when enabled", async () => {
    const eats = (["magnit", "perekrestok", "metro", "lenta"] as const).flatMap(retailer => products.slice(0, 4).map(p => ({
      ...p, id: `yandex_eats:${retailer}_test:${p.id}`, xmlId: `yandex_eats:${retailer}_test:${p.id}`, retailer, catalogProvider: "yandex_eats" as const, retailerPlaceSlug: `${retailer}_test`, isDemo: false,
    })));
    const validateBasketItems = vi.fn();
    const getProductDetails = vi.fn();
    const previewCatalog: CatalogClient = { ...catalog, mode: "live", allowUnverifiedProducts: true, searchProducts: async () => eats, validateBasketItems, getProductDetails };
    const llm = { generateStructured: vi.fn().mockRejectedValue(new Error("fallback")) };
    const result = await composeBaskets(intent, previewCatalog, llm, "test");
    expect(result.variants).toHaveLength(12);
    for (const retailer of ["magnit", "perekrestok", "metro", "lenta"]) {
      const variants = result.variants.filter(v => v.retailer === retailer);
      expect(variants.map(v => v.strategy)).toEqual(["balanced", "budget", "speed"]);
      expect(variants.every(v => v.items.every(p => p.retailer === retailer))).toBe(true);
      expect(variants.every(v => v.warnings.some(w => w.includes("не перепроверены")))).toBe(true);
    }
    expect(validateBasketItems).not.toHaveBeenCalled();
    expect(getProductDetails).not.toHaveBeenCalled();
  });
  it("keeps candidate-only Eats products out of final baskets, including reused candidates", async () => {
    const direct = products.slice(0, 4).map(p => ({ ...p, retailer: "lenta" as const, catalogProvider: "lenta_direct" as const, isDemo: false }));
    const eats = products.map(p => ({ ...p, id: `yandex_eats:magnit_test:${p.id}`, xmlId: `yandex_eats:magnit_test:${p.id}`, retailer: "magnit" as const, catalogProvider: "yandex_eats" as const, retailerPlaceSlug: "magnit_test", isDemo: false }));
    const llm = { generateStructured: vi.fn().mockRejectedValue(new Error("fallback")) };
    const result = await composeBaskets(intent, { ...catalog, mode: "live" }, llm, "test", undefined, [...direct, ...eats]);
    expect(result.variants).toHaveLength(3);
    expect(result.variants.every(v => v.retailer === "lenta")).toBe(true);
    expect(result.candidates.every(p => p.catalogProvider === "lenta_direct")).toBe(true);
  });
  it("sends persistent profile defaults to the intent prompt separately", async () => {
    let payload: unknown;
    const model = {
      async generateStructured<T>(options: { userPayload: unknown }): Promise<StructuredGenerationResult<T>> {
        payload = options.userPayload;
        return { model: "test-model", data: intent as T };
      },
    };

    await analyzeIntent("ужины без лука", null, null, model, "session", undefined, {
      address: "Москва, Тверская 1",
      householdSize: 2,
      excludedIngredients: ["грибы"],
      preferences: ["больше белка"],
    });

    expect(payload).toEqual(expect.objectContaining({
      profileDefaults: {
        address: "Москва, Тверская 1",
        people: 2,
        excludedIngredients: ["грибы"],
        preferences: ["больше белка"],
      },
      newUserMessage: "ужины без лука",
    }));
  });

  it("hydrates three model drafts using only candidate products", async () => {
    const model = {
      async generateStructured<T>(): Promise<StructuredGenerationResult<T>> {
        return {
          model: "test-model",
          data: {
            variants: [
              { strategy: "balanced", items: ["1", "2", "3", "4"].map((xmlId) => ({ xmlId, quantity: 1, role: "main", reasonCode: "budget_fit" })) },
              { strategy: "budget", items: ["1", "2", "3", "4"].map((xmlId) => ({ xmlId, quantity: 1, role: "side", reasonCode: "budget_fit" })) },
              { strategy: "speed", items: ["1", "2", "3", "4"].map((xmlId) => ({ xmlId, quantity: 1, role: "ready_food", reasonCode: "quick" })) },
            ],
          } as T,
        };
      },
    };

    const result = await composeBaskets(intent, catalog, model, "session");
    expect(result.variants.map((variant) => variant.strategy)).toEqual(["balanced", "budget", "speed"]);
    expect(result.variants[0].title).toBe("Сбалансированная");
    expect(result.variants[0].items[0].reason).toBe("Помогает уложиться в бюджет");
    expect(result.retailerResults).toEqual([
      expect.objectContaining({ retailer: "demo", status: "ready", variantCount: 3 }),
    ]);
  });

  it("composes every retailer in one model request without mixing candidates", async () => {
    const retailerProducts = (["vkusvill", "lenta", "pyaterochka", "lavka"] as const).flatMap((retailer) =>
      [1, 2, 3, 4].map((index): NormalizedProduct => ({
        id: `${retailer}:${index}`,
        xmlId: `${retailer}:${index}`,
        retailer,
        name: `${retailer} товар ${index}`,
        priceRub: 100 + index,
        sourceQuery: "ужин",
        isDemo: false,
      })),
    );
    const retailerCatalog: CatalogClient = {
      mode: "live",
      async connect() {},
      async searchProducts() { return retailerProducts; },
      async getProductDetails() { return {}; },
      async createCartLink() { return ""; },
    };
    let callCount = 0;
    let retailersSeen: unknown[] = [];
    let retailersRequested: unknown[] = [];
    const model = {
      async generateStructured<T>(options: { userPayload: unknown }): Promise<StructuredGenerationResult<T>> {
        const payload = options.userPayload as { retailers: unknown[]; candidateProducts: Array<{ xmlId: string; retailer?: string }> };
        callCount += 1;
        retailersRequested = payload.retailers;
        retailersSeen = [...new Set(payload.candidateProducts.map((product) => product.retailer))];
        return {
          model: "test-model",
          data: {
            variants: retailersSeen.flatMap((retailer) => {
              const ids = payload.candidateProducts
                .filter((product) => product.retailer === retailer)
                .map((product) => product.xmlId);
              return ["balanced", "budget", "speed"].map((strategy) => ({
                retailer,
                strategy,
                items: ids.map((xmlId) => ({ xmlId, quantity: 1, role: "main", reasonCode: "budget_fit" })),
              }));
            }),
          } as T,
        };
      },
    };

    const result = await composeBaskets(intent, retailerCatalog, model, "session");

    expect(result.variants).toHaveLength(12);
    expect(result.variants.map((variant) => variant.id)).toEqual([
      "vkusvill:balanced",
      "vkusvill:budget",
      "vkusvill:speed",
      "lenta:balanced",
      "lenta:budget",
      "lenta:speed",
      "pyaterochka:balanced",
      "pyaterochka:budget",
      "pyaterochka:speed",
      "lavka:balanced",
      "lavka:budget",
      "lavka:speed",
    ]);
    expect(callCount).toBe(1);
    expect(retailersRequested).toEqual(["vkusvill", "lenta", "pyaterochka", "lavka"]);
    expect(retailersSeen).toEqual(["vkusvill", "lenta", "pyaterochka", "lavka"]);
    expect(result.variants.every((variant) => variant.items.every((item) => item.retailer === variant.retailer))).toBe(true);
    expect(result.retailerResults).toEqual([
      expect.objectContaining({ retailer: "vkusvill", status: "ready", candidateCount: 4, selectedCandidateCount: 4, variantCount: 3 }),
      expect.objectContaining({ retailer: "lenta", status: "ready", candidateCount: 4, selectedCandidateCount: 4, variantCount: 3 }),
      expect.objectContaining({ retailer: "pyaterochka", status: "ready", candidateCount: 4, selectedCandidateCount: 4, variantCount: 3 }),
      expect.objectContaining({ retailer: "lavka", status: "ready", candidateCount: 4, selectedCandidateCount: 4, variantCount: 3 }),
    ]);
  });

  it("refreshes a live candidate cache that has no Lenta products", async () => {
    const retailerProducts = (["vkusvill", "lenta"] as const).flatMap((retailer) =>
      [1, 2, 3, 4].map((index): NormalizedProduct => ({
        id: `${retailer}:${index}`,
        xmlId: `${retailer}:${index}`,
        retailer,
        name: `${retailer} товар ${index}`,
        priceRub: 100 + index,
        sourceQuery: "ужин",
        isDemo: false,
      })),
    );
    let searchCount = 0;
    const retailerCatalog: CatalogClient = {
      mode: "live",
      async connect() {},
      async searchProducts() {
        searchCount += 1;
        return retailerProducts;
      },
      async getProductDetails() { return {}; },
      async createCartLink() { return ""; },
    };
    let retailersRequested: unknown[] = [];
    const model = {
      async generateStructured<T>(options: { userPayload: unknown }): Promise<StructuredGenerationResult<T>> {
        const payload = options.userPayload as { retailers: unknown[]; candidateProducts: Array<{ xmlId: string; retailer?: string }> };
        retailersRequested = payload.retailers;
        return {
          model: "test-model",
          data: {
            variants: payload.retailers.flatMap((retailer) => {
              const ids = payload.candidateProducts.filter((product) => product.retailer === retailer).map((product) => product.xmlId);
              return ["balanced", "budget", "speed"].map((strategy) => ({
                retailer,
                strategy,
                items: ids.map((xmlId) => ({ xmlId, quantity: 1, role: "main", reasonCode: "budget_fit" })),
              }));
            }),
          } as T,
        };
      },
    };

    const result = await composeBaskets(intent, retailerCatalog, model, "session", undefined, retailerProducts.slice(0, 4));

    expect(searchCount).toBe(1);
    expect(retailersRequested).toEqual(["vkusvill", "lenta"]);
    expect(result.variants.map((variant) => variant.id)).toContain("lenta:balanced");
  });

  it("keeps other retailer baskets when Lenta has no candidates", async () => {
    const vkusvillProducts: NormalizedProduct[] = [1, 2, 3, 4].map((index) => ({
      id: `vkusvill:${index}`,
      xmlId: `vkusvill:${index}`,
      retailer: "vkusvill",
      name: `ВкусВилл товар ${index}`,
      priceRub: 100 + index,
      sourceQuery: "ужин",
      isDemo: false,
    }));
    const retailerCatalog: CatalogClient = {
      mode: "live",
      async connect() {},
      async searchProducts() { return vkusvillProducts; },
      async getProductDetails() { return {}; },
      async createCartLink() { return ""; },
    };
    let modelCallCount = 0;
    const model = {
      async generateStructured<T>(): Promise<StructuredGenerationResult<T>> {
        modelCallCount += 1;
        return {
          model: "test-model",
          data: {
            variants: ["balanced", "budget", "speed"].map((strategy) => ({
              retailer: "vkusvill",
              strategy,
              items: vkusvillProducts.map((product) => ({ xmlId: product.xmlId, quantity: 1, role: "main", reasonCode: "budget_fit" })),
            })),
          } as T,
        };
      },
    };

    const result = await composeBaskets(intent, retailerCatalog, model, "session");

    expect(modelCallCount).toBe(1);
    expect(result.variants.map((variant) => variant.id)).toEqual([
      "vkusvill:balanced",
      "vkusvill:budget",
      "vkusvill:speed",
    ]);
    expect(result.retailerResults).toContainEqual(expect.objectContaining({
      retailer: "lenta",
      status: "no_candidates",
    }));
  });

  it("falls back to deterministic retailer baskets when one retailer returns invalid drafts", async () => {
    const retailerProducts = (["vkusvill", "lenta"] as const).flatMap((retailer) =>
      [1, 2, 3, 4].map((index): NormalizedProduct => ({
        id: `${retailer}:${index}`,
        xmlId: `${retailer}:${index}`,
        retailer,
        name: `${retailer} товар ${index}`,
        priceRub: 100 + index,
        sourceQuery: "ужин",
        isDemo: false,
      })),
    );
    const retailerCatalog: CatalogClient = {
      mode: "live",
      async connect() {},
      async searchProducts() { return retailerProducts; },
      async getProductDetails() { return {}; },
      async createCartLink() { return ""; },
    };
    let callCount = 0;
    const model = {
      async generateStructured<T>(options: { userPayload: unknown }): Promise<StructuredGenerationResult<T>> {
        const payload = options.userPayload as { candidateProducts: Array<{ xmlId: string; retailer?: string }> };
        callCount += 1;
        const vkusvillIds = payload.candidateProducts.filter((product) => product.retailer === "vkusvill").map((product) => product.xmlId);
        return {
          model: "test-model",
          data: {
            variants: [
              ...["balanced", "budget", "speed"].map((strategy) => ({
                retailer: "vkusvill",
                strategy,
                items: vkusvillIds.map((xmlId) => ({ xmlId, quantity: 2, role: "main", reasonCode: "budget_fit" })),
              })),
              ...["balanced", "budget", "speed"].map((strategy) => ({
                retailer: "lenta",
                strategy,
                items: [1, 2, 3, 4].map((index) => ({ xmlId: `unknown:${index}`, quantity: 2, role: "main", reasonCode: "budget_fit" })),
              })),
            ],
          } as T,
        };
      },
    };

    const result = await composeBaskets(intent, retailerCatalog, model, "session");

    expect(result.variants.map((variant) => variant.id)).toEqual([
      "vkusvill:balanced",
      "vkusvill:budget",
      "vkusvill:speed",
      "lenta:balanced",
      "lenta:budget",
      "lenta:speed",
    ]);
    expect(callCount).toBe(1);
    expect(result.variants.find((variant) => variant.id === "vkusvill:balanced")?.items[0].quantity).toBe(2);
    expect(result.variants.find((variant) => variant.id === "lenta:balanced")?.items[0].quantity).toBe(1);
    expect(result.retailerResults).toEqual([
      expect.objectContaining({ retailer: "vkusvill", status: "ready", candidateCount: 4, selectedCandidateCount: 4, variantCount: 3 }),
      expect.objectContaining({ retailer: "lenta", status: "ready", candidateCount: 4, selectedCandidateCount: 4, variantCount: 3 }),
      expect.objectContaining({ retailer: "pyaterochka", status: "no_candidates", candidateCount: 0, selectedCandidateCount: 0, variantCount: 0 }),
      expect.objectContaining({ retailer: "lavka", status: "no_candidates", candidateCount: 0, selectedCandidateCount: 0, variantCount: 0 }),
    ]);
  });

  it("falls back to deterministic retailer baskets when the combined model request fails", async () => {
    const retailerProducts = (["vkusvill", "lenta"] as const).flatMap((retailer) =>
      [1, 2, 3, 4, 5, 6, 7, 8].map((index): NormalizedProduct => ({
        id: `${retailer}:${index}`,
        xmlId: `${retailer}:${index}`,
        retailer,
        name: `${retailer} товар ${index}`,
        priceRub: 100 + index,
        sourceQuery: index <= 4 ? "белок" : "гарнир",
        isDemo: false,
      })),
    );
    const retailerCatalog: CatalogClient = {
      mode: "live",
      async connect() {},
      async searchProducts(query) { return retailerProducts.filter((product) => product.sourceQuery === query.query); },
      async getProductDetails() { return {}; },
      async createCartLink() { return ""; },
    };
    let callCount = 0;
    const model = {
      async generateStructured<T>(): Promise<StructuredGenerationResult<T>> {
        callCount += 1;
        throw new Error("timeout");
      },
    };

    const result = await composeBaskets({
      ...intent,
      searchQueries: [
        { query: "белок", purpose: "основное", sort: "price_asc" },
        { query: "гарнир", purpose: "гарнир", sort: "price_asc" },
      ],
    }, retailerCatalog, model, "session");

    expect(callCount).toBe(1);
    expect(result.variants).toHaveLength(6);
    expect(result.variants.map((variant) => variant.id)).toContain("lenta:balanced");
    expect(result.variants.filter((variant) => variant.retailer === "lenta").map((variant) => variant.totalRub)).toEqual([836, 621, 414]);
    expect(result.retailerResults).toContainEqual(expect.objectContaining({ retailer: "lenta", status: "ready", variantCount: 3 }));
  });

  it("keeps Lenta basket items when validation omits products without marking them unavailable", async () => {
    const lentaProducts: NormalizedProduct[] = [1, 2, 3, 4].map((index) => ({
      id: `lenta:${index}`,
      xmlId: `lenta:${index}`,
      retailer: "lenta",
      name: `Лента товар ${index}`,
      priceRub: 100 + index,
      sourceQuery: "ужин",
      isDemo: false,
    }));
    const validatingCatalog: CatalogClient = {
      mode: "live",
      async connect() {},
      async searchProducts() { return lentaProducts; },
      async getProductDetails() { return {}; },
      async createCartLink() { return ""; },
      async validateBasketItems() {
        return { products: [], unavailableXmlIds: [], changedPrices: [] };
      },
    };
    const model = {
      async generateStructured<T>(): Promise<StructuredGenerationResult<T>> {
        return {
          model: "test-model",
          data: {
            variants: ["balanced", "budget", "speed"].map((strategy) => ({
              strategy,
              items: lentaProducts.map((product) => ({ xmlId: product.xmlId, quantity: 1, role: "main", reasonCode: "budget_fit" })),
            })),
          } as T,
        };
      },
    };

    const result = await composeBaskets(intent, validatingCatalog, model, "session");

    expect(result.variants.map((variant) => variant.id)).toEqual(["lenta:balanced", "lenta:budget", "lenta:speed"]);
    expect(result.variants[0].items).toHaveLength(4);
    expect(result.variants[0].warnings).toContain("Не удалось обновить часть товаров.");
  });

  it("refreshes Lenta prices and drops unavailable Lenta SKUs before showing baskets", async () => {
    const lentaProducts: NormalizedProduct[] = [
      { id: "lenta:1", xmlId: "lenta:1", retailer: "lenta", name: "Молоко", priceRub: 90, availability: "available", sourceQuery: "молоко", isDemo: false },
      { id: "lenta:2", xmlId: "lenta:2", retailer: "lenta", name: "Яйца", priceRub: 120, availability: "available", sourceQuery: "яйца", isDemo: false },
      { id: "lenta:3", xmlId: "lenta:3", retailer: "lenta", name: "Овощи", priceRub: 150, sourceQuery: "овощи", isDemo: false },
      { id: "lenta:4", xmlId: "lenta:4", retailer: "lenta", name: "Суп", priceRub: 220, sourceQuery: "суп", isDemo: false },
      { id: "lenta:5", xmlId: "lenta:5", retailer: "lenta", name: "Плов", priceRub: 250, sourceQuery: "плов", isDemo: false },
    ];
    const validatingCatalog: CatalogClient = {
      mode: "live",
      async connect() {},
      async searchProducts() { return lentaProducts; },
      async getProductDetails() { return {}; },
      async createCartLink() { return ""; },
      async validateBasketItems() {
        return {
          products: [
            { ...lentaProducts[0], priceRub: 99, priceObservedAt: "2026-08-29T10:00:00.000Z" },
            ...lentaProducts.slice(2),
          ],
          unavailableXmlIds: ["lenta:2"],
          changedPrices: [{ xmlId: "lenta:1", oldPriceRub: 90, newPriceRub: 99 }],
        };
      },
    };
    const model = {
      async generateStructured<T>(): Promise<StructuredGenerationResult<T>> {
        return {
          model: "test-model",
          data: {
            variants: ["balanced", "budget", "speed"].map((strategy) => ({
              strategy,
              items: ["lenta:1", "lenta:2", "lenta:3", "lenta:4", "lenta:5"].map((xmlId) => ({ xmlId, quantity: 1, role: "main", reasonCode: "budget_fit" })),
            })),
          } as T,
        };
      },
    };

    const result = await composeBaskets(intent, validatingCatalog, model, "session");

    expect(result.variants[0].items.map((item) => item.xmlId)).not.toContain("lenta:2");
    expect(result.variants[0].items.find((item) => item.xmlId === "lenta:1")).toMatchObject({ priceRub: 99, priceObservedAt: "2026-08-29T10:00:00.000Z" });
    expect(result.variants[0].totalRub).toBe(469);
    expect(result.variants[0].warnings).toContain("Часть товаров больше недоступна.");
  });

  it("validates Lavka items with both identifiers and neutral warnings", async () => {
    const lavkaProducts: NormalizedProduct[] = [1, 2, 3, 4].map((index) => ({
      id: `lavka:slug-${index}`,
      xmlId: `lavka:hash-${index}`,
      retailer: "lavka",
      name: `Лавка товар ${index}`,
      priceRub: 100,
      sourceQuery: "ужин",
      isDemo: false,
    }));
    const validateBasketItems = vi.fn().mockResolvedValue({
      products: [{ ...lavkaProducts[0], priceRub: 101 }, ...lavkaProducts.slice(2)],
      unavailableXmlIds: [lavkaProducts[1].xmlId],
      changedPrices: [{ xmlId: lavkaProducts[0].xmlId, oldPriceRub: 100, newPriceRub: 101 }],
    });
    const catalog: CatalogClient = {
      mode: "live",
      async connect() {},
      async searchProducts() { return lavkaProducts; },
      async getProductDetails() { return {}; },
      async createCartLink() { return ""; },
      validateBasketItems,
    };
    const model = {
      async generateStructured<T>(): Promise<StructuredGenerationResult<T>> {
        return { model: "test", data: { variants: ["balanced", "budget", "speed"].map((strategy) => ({
          retailer: "lavka",
          strategy,
          items: lavkaProducts.map((item) => ({ xmlId: item.xmlId, quantity: 1, role: "main", reasonCode: "requested_by_user" })),
        })) } as T };
      },
    };

    const result = await composeBaskets(intent, catalog, model, "session");

    expect(validateBasketItems).toHaveBeenCalledWith(lavkaProducts.map((item) => ({ id: item.id, xmlId: item.xmlId, quantity: 1, priceRub: 100, name: item.name, retailer: "lavka", catalogProvider: "lavka_direct", retailerPlaceSlug: undefined })), undefined);
    expect(result.variants[0].items.map((item) => item.xmlId)).not.toContain("lavka:hash-2");
    expect(result.variants[0].warnings).toContain("Часть товаров больше недоступна.");
    expect(result.variants[0].warnings).toContain("Цены обновлены перед показом корзины.");
  });
});
