import { describe, expect, it } from "vitest";
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
  });
});
