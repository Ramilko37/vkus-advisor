import { describe, expect, it } from "vitest";
import { hydrateAndValidateVariants } from "./basketValidation";
import type { BasketIntent, BasketVariantDraft, NormalizedProduct } from "../types/domain";

const intent: BasketIntent = {
  originalRequest: "ужины на 3 дня",
  people: 2,
  days: 3,
  meals: ["ужин"],
  budgetRub: 300,
  maxCookingMinutes: 20,
  excludedIngredients: ["грибы"],
  preferences: [],
  readyFoodAllowed: true,
  priority: "balanced",
  needsClarification: false,
  clarificationQuestion: null,
  assumptions: [],
  searchQueries: [],
};

const products: NormalizedProduct[] = [
  { id: "1", xmlId: "1", name: "Гречка", priceRub: 100, sourceQuery: "гречка", isDemo: true },
  { id: "2", xmlId: "2", name: "Котлеты", priceRub: 180, sourceQuery: "котлеты", isDemo: true },
  { id: "3", xmlId: "3", name: "Грибы", priceRub: 90, composition: "грибы", sourceQuery: "грибы", isDemo: true },
  { id: "4", xmlId: "4", name: "Овощи", priceRub: 120, sourceQuery: "овощи", isDemo: true },
  { id: "5", xmlId: "5", name: "Суп", priceRub: 220, sourceQuery: "готовая еда", isDemo: true },
  { id: "6", xmlId: "6", name: "Салат", priceRub: 150, sourceQuery: "овощи", isDemo: true },
];

describe("hydrateAndValidateVariants", () => {
  it("keeps three strategies, merges duplicates, clamps quantities and recalculates totals", () => {
    const drafts: BasketVariantDraft[] = [
      { strategy: "balanced", items: [{ xmlId: "1", quantity: 10, role: "side", reasonCode: "versatile" }, { xmlId: "1", quantity: 2, role: "side", reasonCode: "versatile" }, { xmlId: "2", quantity: 1, role: "protein", reasonCode: "high_protein" }, { xmlId: "4", quantity: 1, role: "vegetables", reasonCode: "adds_variety" }, { xmlId: "6", quantity: 1, role: "vegetables", reasonCode: "adds_variety" }] },
      { strategy: "budget", items: [{ xmlId: "1", quantity: 1, role: "side", reasonCode: "budget_fit" }, { xmlId: "2", quantity: 1, role: "protein", reasonCode: "good_value" }, { xmlId: "4", quantity: 1, role: "vegetables", reasonCode: "good_value" }, { xmlId: "6", quantity: 1, role: "vegetables", reasonCode: "good_value" }, { xmlId: "404", quantity: 1, role: "other", reasonCode: "requested_by_user" }] },
      { strategy: "speed", items: [{ xmlId: "2", quantity: 1, role: "main", reasonCode: "quick" }, { xmlId: "3", quantity: 1, role: "vegetables", reasonCode: "adds_variety" }, { xmlId: "5", quantity: 1, role: "ready_food", reasonCode: "ready_to_eat" }, { xmlId: "6", quantity: 1, role: "vegetables", reasonCode: "quick" }] },
    ];

    const variants = hydrateAndValidateVariants(drafts, products, intent);
    expect(variants).toHaveLength(3);
    expect(variants[0].items[0].quantity).toBe(9);
    expect(variants[0].totalRub).toBe(1350);
    expect(variants[1].items.map((item) => item.xmlId)).not.toContain("404");
    expect(variants[1].items[0].reason).toBe("Помогает уложиться в бюджет");
    expect(variants[0].warnings.some((warning) => warning.includes("выше бюджета"))).toBe(true);
  });

  it("rejects duplicate strategies", () => {
    const items = ["1", "2", "4", "6"].map((xmlId) => ({ xmlId, quantity: 1, role: "side" as const, reasonCode: "good_value" as const }));
    expect(hydrateAndValidateVariants([
      { strategy: "balanced", items },
      { strategy: "balanced", items },
      { strategy: "speed", items },
    ], products, intent)).toHaveLength(0);
  });
});
