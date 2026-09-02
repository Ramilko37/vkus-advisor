import { describe, expect, it } from "vitest";
import { basketCompareResponseSchema } from "./schemas";

const coverage = {
  people: 2,
  days: 3,
  meals: [{ type: "ужин", count: 3 }],
  totalMeals: 3,
  label: "3 ужина · 2 человека",
};

const constraints = {
  exclusions: ["грибы"],
  dietaryRestrictions: [],
  hardBudgetRub: 3000,
};

const baseVariant = {
  id: "vkusvill:balanced",
  strategy: "balanced" as const,
  title: "Сбалансированная",
  strategyDescription: "баланс цены и готовки",
  totalRub: 1200,
  uniqueItemsCount: 1,
  coverage,
  constraints,
  prep: { minutes: null, complexity: "medium" as const, label: "готовка: средняя" },
  tradeoffSummary: "Цена и готовка в балансе.",
  deltaToBalanced: { priceRub: 0 },
  score: 70,
  recommended: true,
  retailer: "vkusvill" as const,
  storeId: null,
  items: [{ id: "1", xmlId: "1", name: "Гречка", priceRub: 100, quantity: 1, role: "Гарнир", reason: "Подходит", sourceQuery: "гречка", isDemo: false }],
  validation: { status: "not_supported" as const, checkedAt: null },
  warnings: [],
};

function response() {
  return {
    variants: [
      baseVariant,
      { ...baseVariant, id: "vkusvill:economy", strategy: "economy", title: "Экономная", recommended: false },
      { ...baseVariant, id: "vkusvill:fast", strategy: "fast", title: "Быстрая", recommended: false },
    ],
  };
}

describe("basketCompareResponseSchema", () => {
  it("accepts the complete three-strategy Compare contract", () => {
    expect(basketCompareResponseSchema.safeParse(response()).success).toBe(true);
  });

  it("rejects a variant with missing coverage", () => {
    const value = response();
    const withoutCoverage = { ...value.variants[1] };
    Reflect.deleteProperty(withoutCoverage, "coverage");
    value.variants[1] = withoutCoverage as typeof value.variants[number];

    expect(basketCompareResponseSchema.safeParse(value).success).toBe(false);
  });

  it("rejects different request invariants inside one retailer group", () => {
    const value = response();
    value.variants[2] = { ...value.variants[2], coverage: { ...coverage, days: 4 } };

    expect(basketCompareResponseSchema.safeParse(value).success).toBe(false);
  });

  it("requires exactly one scoring winner per retailer group", () => {
    const value = response();
    value.variants[1] = { ...value.variants[1], recommended: true };

    expect(basketCompareResponseSchema.safeParse(value).success).toBe(false);
  });
});
