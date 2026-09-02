import { describe, expect, it } from "vitest";
import { analyzeIntent, composeBaskets } from "./basketOrchestrator";
import type { BasketIntent, BasketVariantDraft, CatalogClient, NormalizedProduct, StructuredGenerationResult } from "../types/domain";

const intent: BasketIntent = {
  originalRequest: "ужины",
  people: 2,
  days: 3,
  meals: ["ужин"],
  budgetRub: 3000,
  budgetIsHard: true,
  maxCookingMinutes: 20,
  excludedIngredients: [],
  dietaryRestrictions: [],
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

const targetCoverage = { people: 2, days: 3, meals: [{ type: "ужин", count: 3 }], totalMeals: 3, label: "3 ужина · 2 человека" };

function modelDraft(strategy: BasketVariantDraft["strategy"], items: BasketVariantDraft["items"], retailer: BasketVariantDraft["retailer"] = "demo"): BasketVariantDraft {
  return { retailer, strategy, coverage: targetCoverage, prepMinutes: strategy === "fast" ? 10 : strategy === "economy" ? 45 : 30, items };
}

describe("composeBaskets", () => {
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
              modelDraft("balanced", ["1", "2", "3", "4"].map((xmlId) => ({ xmlId, quantity: 1, role: "main", reasonCode: "budget_fit" }))),
              modelDraft("economy", ["1", "2", "3", "4"].map((xmlId) => ({ xmlId, quantity: 1, role: "side", reasonCode: "budget_fit" }))),
              modelDraft("fast", ["1", "2", "3", "4"].map((xmlId) => ({ xmlId, quantity: 1, role: "ready_food", reasonCode: "quick" }))),
            ],
          } as T,
        };
      },
    };

    const result = await composeBaskets(intent, catalog, model, "session");
    expect(result.variants.map((variant) => variant.strategy)).toEqual(["balanced", "economy", "fast"]);
    expect(result.variants[0].title).toBe("Сбалансированная");
    expect(result.variants[0].items[0].reason).toBe("Помогает уложиться в бюджет");
    expect(result.retailerResults).toEqual([
      expect.objectContaining({ retailer: "demo", status: "ready", variantCount: 3 }),
    ]);
  });

  it("repairs only strategies that violate their price or prep tradeoff", async () => {
    const ids = ["1", "2", "3", "4"].map((xmlId) => ({ xmlId, quantity: 1, role: "main" as const, reasonCode: "good_value" as const }));
    const model = {
      async generateStructured<T>(): Promise<StructuredGenerationResult<T>> {
        return {
          model: "test-model",
          data: {
            variants: [
              modelDraft("balanced", ids.map((item) => ({ ...item, quantity: 2 }))),
              modelDraft("economy", ids.map((item) => ({ ...item, quantity: 3 }))),
              { ...modelDraft("fast", ids), prepMinutes: 60 },
            ],
          } as T,
        };
      },
    };

    const result = await composeBaskets(intent, catalog, model, "session");

    expect(result.variants.find((variant) => variant.strategy === "balanced")?.items.every((item) => item.quantity === 2)).toBe(true);
    expect(result.variants.find((variant) => variant.strategy === "economy")?.items.every((item) => item.quantity === 1)).toBe(true);
    expect(result.variants.find((variant) => variant.strategy === "fast")?.prep.minutes).toBe(10);
  });

  it("returns a controlled error when fallback cannot restore a strategy tradeoff", async () => {
    const ids = ["1", "2", "3", "4"].map((xmlId) => ({ xmlId, quantity: 1, role: "main" as const, reasonCode: "good_value" as const }));
    const model = {
      async generateStructured<T>(): Promise<StructuredGenerationResult<T>> {
        return {
          model: "test-model",
          data: {
            variants: [
              { ...modelDraft("balanced", ids), prepMinutes: 5 },
              modelDraft("economy", ids),
              { ...modelDraft("fast", ids), prepMinutes: 60 },
            ],
          } as T,
        };
      },
    };

    await expect(composeBaskets(intent, catalog, model, "session")).rejects.toThrow("Модель вернула неподходящий формат");
  });

  it("sends one target coverage to basket generation", async () => {
    let payload: unknown;
    const model = {
      async generateStructured<T>(options: { userPayload: unknown }): Promise<StructuredGenerationResult<T>> {
        payload = options.userPayload;
        return {
          model: "test-model",
          data: {
            variants: (["balanced", "economy", "fast"] as const).map((strategy) => modelDraft(
              strategy,
              ["1", "2", "3", "4"].map((xmlId) => ({ xmlId, quantity: 1, role: "main", reasonCode: "good_value" })),
            )),
          } as T,
        };
      },
    };

    await composeBaskets(intent, catalog, model, "session");

    expect(payload).toEqual(expect.objectContaining({
      targetCoverage: {
        people: 2,
        days: 3,
        meals: [{ type: "ужин", count: 3 }],
        totalMeals: 3,
        label: "3 ужина · 2 человека",
      },
    }));
  });

  it("composes every retailer in one model request without mixing candidates", async () => {
    const retailerProducts = (["vkusvill", "lenta", "pyaterochka"] as const).flatMap((retailer) =>
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
              return ["balanced", "economy", "fast"].map((strategy) => ({
                retailer,
                strategy,
                coverage: targetCoverage,
                prepMinutes: strategy === "fast" ? 10 : strategy === "economy" ? 45 : 30,
                items: ids.map((xmlId) => ({ xmlId, quantity: 1, role: "main", reasonCode: "budget_fit" })),
              }));
            }),
          } as T,
        };
      },
    };

    const result = await composeBaskets(intent, retailerCatalog, model, "session");

    expect(result.variants).toHaveLength(9);
    expect(result.variants.map((variant) => variant.id)).toEqual([
      "vkusvill:balanced",
      "vkusvill:economy",
      "vkusvill:fast",
      "lenta:balanced",
      "lenta:economy",
      "lenta:fast",
      "pyaterochka:balanced",
      "pyaterochka:economy",
      "pyaterochka:fast",
    ]);
    expect(callCount).toBe(1);
    expect(retailersRequested).toEqual(["vkusvill", "lenta", "pyaterochka"]);
    expect(retailersSeen).toEqual(["vkusvill", "lenta", "pyaterochka"]);
    expect(result.variants.every((variant) => variant.items.every((item) => item.retailer === variant.retailer))).toBe(true);
    expect(result.retailerResults).toEqual([
      expect.objectContaining({ retailer: "vkusvill", status: "ready", candidateCount: 4, selectedCandidateCount: 4, variantCount: 3 }),
      expect.objectContaining({ retailer: "lenta", status: "ready", candidateCount: 4, selectedCandidateCount: 4, variantCount: 3 }),
      expect.objectContaining({ retailer: "pyaterochka", status: "ready", candidateCount: 4, selectedCandidateCount: 4, variantCount: 3 }),
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
              return ["balanced", "economy", "fast"].map((strategy) => ({
                retailer,
                strategy,
                coverage: targetCoverage,
                prepMinutes: strategy === "fast" ? 10 : strategy === "economy" ? 45 : 30,
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
            variants: ["balanced", "economy", "fast"].map((strategy) => ({
              retailer: "vkusvill",
              strategy,
              coverage: targetCoverage,
              prepMinutes: strategy === "fast" ? 10 : strategy === "economy" ? 45 : 30,
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
      "vkusvill:economy",
      "vkusvill:fast",
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
              ...["balanced", "economy", "fast"].map((strategy) => ({
                retailer: "vkusvill",
                strategy,
                coverage: targetCoverage,
                prepMinutes: strategy === "fast" ? 10 : strategy === "economy" ? 45 : 30,
                items: vkusvillIds.map((xmlId) => ({ xmlId, quantity: 2, role: "main", reasonCode: "budget_fit" })),
              })),
              ...["balanced", "economy", "fast"].map((strategy) => ({
                retailer: "lenta",
                strategy,
                coverage: targetCoverage,
                prepMinutes: strategy === "fast" ? 10 : strategy === "economy" ? 45 : 30,
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
      "vkusvill:economy",
      "vkusvill:fast",
      "lenta:balanced",
      "lenta:economy",
      "lenta:fast",
    ]);
    expect(callCount).toBe(1);
    expect(result.variants.find((variant) => variant.id === "vkusvill:balanced")?.items[0].quantity).toBe(2);
    expect(result.variants.find((variant) => variant.id === "lenta:balanced")?.items[0].quantity).toBe(1);
    expect(result.retailerResults).toEqual([
      expect.objectContaining({ retailer: "vkusvill", status: "ready", candidateCount: 4, selectedCandidateCount: 4, variantCount: 3 }),
      expect.objectContaining({ retailer: "lenta", status: "ready", candidateCount: 4, selectedCandidateCount: 4, variantCount: 3 }),
      expect.objectContaining({ retailer: "pyaterochka", status: "no_candidates", candidateCount: 0, selectedCandidateCount: 0, variantCount: 0 }),
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
    expect(result.variants.filter((variant) => variant.retailer === "lenta").map((variant) => variant.totalRub)).toEqual([836, 410, 414]);
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
            variants: ["balanced", "economy", "fast"].map((strategy) => ({
              strategy,
              coverage: targetCoverage,
              prepMinutes: strategy === "fast" ? 10 : strategy === "economy" ? 45 : 30,
              items: lentaProducts.map((product) => ({ xmlId: product.xmlId, quantity: 1, role: "main", reasonCode: "budget_fit" })),
            })),
          } as T,
        };
      },
    };

    const result = await composeBaskets(intent, validatingCatalog, model, "session");

    expect(result.variants.map((variant) => variant.id)).toEqual(["lenta:balanced", "lenta:economy", "lenta:fast"]);
    expect(result.variants[0].items).toHaveLength(4);
    expect(result.variants[0].validation.status).toBe("partial");
    expect(result.variants[0].warnings).toContain("Не удалось обновить часть товаров Ленты. Проверьте цену перед оформлением.");
  });

  it("refreshes Lenta prices and drops unavailable Lenta SKUs before showing baskets", async () => {
    const lentaProducts: NormalizedProduct[] = [
      { id: "lenta:1", xmlId: "lenta:1", retailer: "lenta", name: "Молоко", priceRub: 90, composition: "молоко", availability: "available", sourceQuery: "молоко", isDemo: false },
      { id: "lenta:2", xmlId: "lenta:2", retailer: "lenta", name: "Яйца", priceRub: 120, composition: "яйца", availability: "available", sourceQuery: "яйца", isDemo: false },
      { id: "lenta:3", xmlId: "lenta:3", retailer: "lenta", name: "Овощи", priceRub: 150, composition: "овощи", sourceQuery: "овощи", isDemo: false },
      { id: "lenta:4", xmlId: "lenta:4", retailer: "lenta", name: "Суп", priceRub: 220, composition: "овощи, вода", sourceQuery: "суп", isDemo: false },
      { id: "lenta:5", xmlId: "lenta:5", retailer: "lenta", name: "Плов", priceRub: 250, composition: "рис, овощи", sourceQuery: "плов", isDemo: false },
    ];
    const validatingCatalog: CatalogClient = {
      mode: "live",
      async connect() {},
      async searchProducts(query) {
        return query.query === "готовая еда" ? lentaProducts.slice(3) : lentaProducts.slice(0, 3);
      },
      async getProductDetails() { return {}; },
      async createCartLink() { return ""; },
      async validateBasketItems() {
        return {
          products: [
            { ...lentaProducts[0], composition: undefined, priceRub: 99, priceObservedAt: "2026-08-29T10:00:00.000Z" },
            ...lentaProducts.slice(2).map((product) => ({ ...product, composition: undefined })),
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
            variants: ["balanced", "economy", "fast"].map((strategy) => ({
              strategy,
              coverage: targetCoverage,
              prepMinutes: strategy === "fast" ? 10 : strategy === "economy" ? 45 : 30,
              items: ["lenta:1", "lenta:2", "lenta:3", "lenta:4", "lenta:5"].map((xmlId) => ({ xmlId, quantity: 1, role: "main", reasonCode: "budget_fit" })),
            })),
          } as T,
        };
      },
    };

    const result = await composeBaskets({
      ...intent,
      dietaryRestrictions: ["вегетарианство"],
      searchQueries: [
        { query: "ужин", purpose: "основа", sort: "popularity" },
        { query: "готовая еда", purpose: "готовые блюда", sort: "popularity" },
      ],
    }, validatingCatalog, model, "session");

    expect(result.variants[0].items.map((item) => item.xmlId)).not.toContain("lenta:2");
    expect(result.variants[0].items.find((item) => item.xmlId === "lenta:1")).toMatchObject({ priceRub: 99, priceObservedAt: "2026-08-29T10:00:00.000Z" });
    expect(result.variants[0].items.find((item) => item.xmlId === "lenta:1")?.composition).toBe("молоко");
    expect(result.variants[0].totalRub).toBe(719);
    expect(result.variants[0].validation).toEqual({ status: "validated", checkedAt: "2026-08-29T10:00:00.000Z" });
    expect(result.variants[0].warnings).toContain("Часть товаров Ленты больше недоступна.");
  });

  it("rejects refreshed variants that no longer fit a hard budget", async () => {
    const lentaProducts: NormalizedProduct[] = [1, 2, 3, 4].map((index) => ({
      id: `lenta:${index}`,
      xmlId: `lenta:${index}`,
      retailer: "lenta",
      name: `Лента товар ${index}`,
      priceRub: 50,
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
        return {
          products: lentaProducts.map((product) => ({ ...product, priceRub: 100 })),
          unavailableXmlIds: [],
          changedPrices: lentaProducts.map((product) => ({ xmlId: product.xmlId, oldPriceRub: 50, newPriceRub: 100 })),
        };
      },
    };
    const model = {
      async generateStructured<T>(): Promise<StructuredGenerationResult<T>> {
        return {
          model: "test-model",
          data: {
            variants: (["balanced", "economy", "fast"] as const).map((strategy) => ({
              retailer: "lenta",
              strategy,
              coverage: targetCoverage,
              prepMinutes: strategy === "fast" ? 10 : strategy === "economy" ? 45 : 30,
              items: lentaProducts.map((product) => ({ xmlId: product.xmlId, quantity: 1, role: "main", reasonCode: "budget_fit" })),
            })),
          } as T,
        };
      },
    };

    await expect(composeBaskets({ ...intent, budgetRub: 300 }, validatingCatalog, model, "session")).rejects.toThrow("Модель вернула неподходящий формат");
  });
});
