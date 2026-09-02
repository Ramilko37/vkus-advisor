import { describe, expect, it } from "vitest";
import { getVariantPresentation } from "./variantPresentation";
import type { BasketItem, BasketVariant } from "../types/domain";

describe("variant presentation", () => {
  it("projects display-ready Compare metadata from the product contract", () => {
    const variant = makeVariant();

    expect(getVariantPresentation(variant)).toEqual({
      title: "Экономная",
      subtitle: "минимум стоимости",
      recommendationLabel: "Рекомендуем",
      priceDeltaLabel: "+200 ₽ к балансу",
      tradeoffText: "По цене выше баланса, проверьте состав.",
      cookingLabel: "готовка: больше",
      coverageLabel: "3 ужина · 2 человека",
      previewItems: ["Куриное филе"],
    });
  });

  it("does not derive coverage or recommendation from basket items", () => {
    const variant = makeVariant({
      recommended: false,
      coverage: { people: 4, days: 1, meals: [{ type: "обед", count: 1 }], totalMeals: 1, label: "1 обед · 4 человека" },
    });

    const result = getVariantPresentation(variant);

    expect(result.coverageLabel).toBe("1 обед · 4 человека");
    expect(result.recommendationLabel).toBeNull();
  });
});

function makeVariant(overrides: Partial<BasketVariant> = {}): BasketVariant {
  const items: BasketItem[] = [{
    id: "1",
    xmlId: "1",
    name: "Куриное филе",
    priceRub: 300,
    quantity: 1,
    role: "Основное",
    reason: "Подходит",
    sourceQuery: "ужин",
    isDemo: false,
  }];
  return {
    id: "economy",
    retailer: "vkusvill",
    storeId: null,
    strategy: "economy",
    title: "Экономная",
    strategyDescription: "минимум стоимости",
    totalRub: 1200,
    uniqueItemsCount: 1,
    coverage: { people: 2, days: 3, meals: [{ type: "ужин", count: 3 }], totalMeals: 3, label: "3 ужина · 2 человека" },
    constraints: { exclusions: [], dietaryRestrictions: [], hardBudgetRub: 3000 },
    prep: { minutes: null, complexity: "high", label: "готовка: больше" },
    tradeoffSummary: "По цене выше баланса, проверьте состав.",
    deltaToBalanced: { priceRub: 200 },
    score: 84,
    recommended: true,
    validation: { status: "not_supported", checkedAt: null },
    items,
    warnings: [],
    ...overrides,
  };
}
