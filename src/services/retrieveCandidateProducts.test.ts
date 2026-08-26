import { describe, expect, it } from "vitest";
import { retrieveCandidateProducts } from "./retrieveCandidateProducts";
import type { BasketIntent, CatalogClient, NormalizedProduct, SearchQuery } from "../types/domain";

const baseIntent: BasketIntent = {
  originalRequest: "ужины без грибов",
  people: 1,
  days: 3,
  meals: ["ужин"],
  budgetRub: null,
  maxCookingMinutes: 30,
  excludedIngredients: ["грибы"],
  preferences: [],
  readyFoodAllowed: true,
  priority: "balanced",
  needsClarification: false,
  clarificationQuestion: null,
  assumptions: [],
  searchQueries: [
    { query: "гречка", purpose: "гарнир", sort: "popularity" },
    { query: "котлеты", purpose: "основное", sort: "rating" },
  ],
};

class TestCatalog implements CatalogClient {
  readonly mode = "demo" as const;
  async connect() {}
  async getProductDetails() { return {}; }
  async createCartLink() { return ""; }
  async searchProducts(query: SearchQuery): Promise<NormalizedProduct[]> {
    if (query.query === "котлеты") throw new Error("network");
    return [
      { id: "1", xmlId: "1", name: "Гречка", priceRub: 100, sourceQuery: query.query, isDemo: true },
      { id: "2", xmlId: "2", name: "Грибы жареные", priceRub: 150, composition: "грибы", sourceQuery: query.query, isDemo: true },
      { id: "1b", xmlId: "1", name: "Гречка ядрица", priceRub: 100, weightLabel: "900 г", sourceQuery: query.query, isDemo: true },
    ];
  }
}

describe("retrieveCandidateProducts", () => {
  it("keeps successful searches, deduplicates richer products and filters exclusions", async () => {
    const products = await retrieveCandidateProducts(baseIntent, new TestCatalog());
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({ xmlId: "1", name: "Гречка ядрица", weightLabel: "900 г" });
  });
});
