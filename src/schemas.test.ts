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
  uniqueItemsCount: 4,
  coverage,
  constraints,
  prep: { minutes: 30, complexity: "medium" as const, label: "готовка: средняя" },
  tradeoffSummary: "Цена и готовка в балансе.",
  deltaToBalanced: { priceRub: 0 },
  score: 70,
  recommended: true,
  retailer: "vkusvill" as const,
  storeId: null,
  items: ["1", "2", "3", "4"].map((xmlId) => ({ id: xmlId, xmlId, name: `Товар ${xmlId}`, priceRub: 300, quantity: 1, role: "Основное", reason: "Подходит", sourceQuery: "ужин", isDemo: false })),
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

  it("rejects hard-budget and strategy tradeoff violations", () => {
    const overBudget = response();
    overBudget.variants[0] = { ...overBudget.variants[0], constraints: { ...constraints, hardBudgetRub: 1000 } };
    expect(basketCompareResponseSchema.safeParse(overBudget).success).toBe(false);

    const wrongTradeoffs = response();
    wrongTradeoffs.variants[1] = { ...wrongTradeoffs.variants[1], totalRub: 1300 };
    wrongTradeoffs.variants[2] = { ...wrongTradeoffs.variants[2], prep: { ...wrongTradeoffs.variants[2].prep, minutes: 31 } };
    expect(basketCompareResponseSchema.safeParse(wrongTradeoffs).success).toBe(false);
  });
});
