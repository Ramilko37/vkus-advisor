import { describe, expect, it } from "vitest";
import { getVariantPresentation, recommendedStrategy } from "./variantPresentation";
import type { BasketIntent, BasketItem, BasketVariant } from "../types/domain";

const baseItems = [
  item("1", "Куриное филе", 300, "Основное"),
  item("2", "Гречка", 100, "Гарнир"),
  item("3", "Овощи", 150, "Овощи"),
  item("4", "Салат", 120, "Овощи"),
  item("5", "Кефир", 95, "Напиток"),
  item("6", "Яйца", 150, "Белок"),
  item("7", "Яблоки", 140, "Перекус"),
];

describe("variant presentation", () => {
  it("does not label a budget strategy as economical when it costs more than balanced", () => {
    const balanced = variant("balanced", 1000, baseItems);
    const budget = variant("budget", 1200, baseItems);

    const result = getVariantPresentation(budget, [balanced, budget]);

    expect(result.title).toBe("Альтернатива");
    expect(result.priceDeltaLabel).toBe("На 200 ₽ дороже");
    expect(result.tradeoffText).toBe("По цене выше баланса, проверьте состав.");
    expect(result.priceDeltaTone).toBe("warning");
  });

  it("uses plain language for cheaper, costlier, and equal baskets", () => {
    const balanced = variant("balanced", 1000, baseItems);
    const cheaper = variant("budget", 869, baseItems);
    const costlier = variant("speed", 1230, baseItems);
    const equal = variant("speed", 1000, baseItems);
    const variants = [balanced, cheaper, costlier, equal];

    expect(getVariantPresentation(cheaper, variants).priceDeltaLabel).toBe("На 131 ₽ дешевле");
    expect(getVariantPresentation(costlier, variants).priceDeltaLabel).toBe("На 230 ₽ дороже");
    expect(getVariantPresentation(equal, variants).priceDeltaLabel).toBe("Цена как у сбалансированной");
    expect(getVariantPresentation(cheaper, variants).itemCountLabel).toBe("7 товаров");
    expect(getVariantPresentation(cheaper, variants).priceDeltaTone).toBe("positive");
  });

  it("does not call a faster variant more expensive when it is cheaper than balanced", () => {
    const balanced = variant("balanced", 1000, baseItems);
    const speed = variant("speed", 900, baseItems);

    const result = getVariantPresentation(speed, [balanced, speed]);

    expect(result.priceDeltaLabel).toBe("На 100 ₽ дешевле");
    expect(result.tradeoffText).toBe("Быстрее без переплаты.");
  });

  it("summarizes comparison cards without draft terminology", () => {
    const balanced = variant("balanced", 1000, baseItems.slice(0, 4));

    const result = getVariantPresentation(balanced, [balanced]);

    expect(result.previewItems).toEqual(["Куриное филе", "Гречка", "Овощи"]);
    expect(result.cookingLabel).toBe("средняя готовка");
    expect(result.itemCountLabel).toBe("4 товара");
    expect(JSON.stringify(result)).not.toContain("черновик");
  });

  it.each([
    ["budget", "budget"],
    ["speed", "speed"],
    ["balanced", "balanced"],
  ] as const)("recommends %s when that is the resolved priority", (priority, expected) => {
    const variants = [
      variant("balanced", 1000, baseItems),
      variant("budget", 800, baseItems),
      variant("speed", 1200, baseItems),
    ];

    expect(recommendedStrategy({ ...intent, priority }, variants)).toBe(expected);
  });

  it("omits recommendation when the desired budget strategy became an alternative", () => {
    const variants = [variant("balanced", 1000, baseItems), variant("budget", 1200, baseItems)];

    expect(recommendedStrategy({ ...intent, priority: "budget" }, variants)).toBeNull();
  });
});

const intent: BasketIntent = {
  originalRequest: "ужины на 3 дня",
  people: 2,
  days: 3,
  meals: ["ужин"],
  budgetRub: 3000,
  maxCookingMinutes: null,
  excludedIngredients: ["грибов"],
  preferences: [],
  readyFoodAllowed: true,
  priority: "balanced",
  needsClarification: false,
  clarificationQuestion: null,
  assumptions: [],
  searchQueries: [],
};

function item(xmlId: string, name: string, priceRub: number, role: string): BasketItem {
  return {
    id: xmlId,
    xmlId,
    name,
    priceRub,
    quantity: 1,
    role,
    reason: "Подходит",
    sourceQuery: "fixture",
    isDemo: false,
  };
}

function variant(strategy: BasketVariant["strategy"], totalRub: number, items: BasketItem[]): BasketVariant {
  return {
    id: strategy,
    strategy,
    title: strategy,
    summary: "",
    tradeoffs: [],
    items,
    totalRub,
    uniqueItemsCount: items.length,
    warnings: [],
  };
}
