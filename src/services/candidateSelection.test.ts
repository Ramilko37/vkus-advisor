import { describe, expect, it } from "vitest";
import { selectCandidatesForLlm, toLlmCandidate } from "./candidateSelection";
import type { BasketIntent, NormalizedProduct } from "../types/domain";

const intent: BasketIntent = {
  originalRequest: "обычная корзина",
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
  searchQueries: [],
};

const products = Array.from({ length: 24 }, (_, index): NormalizedProduct => ({
  id: String(index),
  xmlId: String(index),
  name: `Товар ${index}`,
  priceRub: 100 + index,
  rating: 4 + (index % 5) / 10,
  description: "длинное описание",
  composition: "молоко, сахар".repeat(40),
  proteins: 12,
  calories: 220,
  sourceQuery: ["белок", "гарнир", "овощи"][index % 3],
  isDemo: true,
}));

describe("candidate selection", () => {
  it("returns at most 16 products while keeping different purposes", () => {
    const result = selectCandidatesForLlm(products, intent);
    expect(result).toHaveLength(16);
    expect(new Set(result.map((product) => product.sourceQuery)).size).toBeGreaterThan(1);
  });

  it("never sends description or composition for regular basket", () => {
    const payload = toLlmCandidate(products[0], intent);
    expect(payload).not.toHaveProperty("description");
    expect(payload).not.toHaveProperty("composition");
    expect(payload).not.toHaveProperty("proteins");
    expect(payload).not.toHaveProperty("calories");
  });

  it("sends shortened composition only for restrictions", () => {
    const payload = toLlmCandidate(products[0], { ...intent, excludedIngredients: ["молоко"] });
    expect(payload.composition).toHaveLength(240);
    expect(payload.restrictionHits).toEqual(["молоко"]);
  });

  it("sends nutrition only for protein requests", () => {
    const payload = toLlmCandidate(products[0], { ...intent, originalRequest: "белковая корзина" });
    expect(payload.proteins).toBe(12);
    expect(payload.calories).toBe(220);
  });
});
