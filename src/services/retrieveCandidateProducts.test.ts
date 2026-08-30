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
  async getProductDetails(productId: string) {
    return productId === "1b" ? { imageUrl: "https://img.vkusvill.ru/product.webp", description: "Крупа для ужина" } : {};
  }
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
    expect(products[0]).toMatchObject({ xmlId: "1", name: "Гречка ядрица", weightLabel: "900 г", imageUrl: "https://img.vkusvill.ru/product.webp" });
  });

  it("keeps enough candidates for a retailer that appears in later searches before applying the global cap", async () => {
    const intent = {
      ...baseIntent,
      excludedIngredients: [],
      searchQueries: [
        { query: "мясо", purpose: "белок", sort: "popularity" },
        { query: "курица", purpose: "белок", sort: "popularity" },
        { query: "овощи", purpose: "овощи", sort: "popularity" },
        { query: "зелень", purpose: "зелень", sort: "popularity" },
      ],
    } satisfies BasketIntent;
    const catalog: CatalogClient = {
      mode: "live",
      async connect() {},
      async getProductDetails() { return {}; },
      async createCartLink() { return ""; },
      async searchProducts(query) {
        const retailers = query.query === "зелень" ? ["vkusvill", "lenta", "pyaterochka"] : ["vkusvill", "lenta"];
        return retailers.flatMap((retailer) =>
          [1, 2, 3, 4].map((index): NormalizedProduct => ({
            id: `${retailer}:${query.query}:${index}`,
            xmlId: `${retailer}:${query.query}:${index}`,
            retailer: retailer as NormalizedProduct["retailer"],
            name: `${retailer} ${query.query} ${index}`,
            priceRub: 100 + index,
            sourceQuery: query.query,
            isDemo: false,
          })),
        );
      },
    };

    const products = await retrieveCandidateProducts(intent, catalog);
    const counts = products.reduce<Record<string, number>>((acc, product) => {
      const retailer = product.retailer || "demo";
      acc[retailer] = (acc[retailer] || 0) + 1;
      return acc;
    }, {});

    expect(counts.pyaterochka).toBe(4);
  });
});
