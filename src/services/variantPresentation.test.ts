import { describe, expect, it } from "vitest";
import { getVariantPresentation } from "./variantPresentation";
import type { BasketItem, BasketVariant } from "../types/domain";

const baseItems = [
  item("1", "Куриное филе", 300, "Основное"),
  item("2", "Гречка", 100, "Гарнир"),
  item("3", "Овощи", 150, "Овощи"),
  item("4", "Салат", 120, "Овощи"),
];

describe("variant presentation", () => {
  it("does not label a budget strategy as economical when it costs more than balanced", () => {
    const balanced = variant("balanced", 1000, baseItems);
    const budget = variant("budget", 1200, baseItems);

    const result = getVariantPresentation(budget, [balanced, budget]);

    expect(result.title).toBe("Альтернатива");
    expect(result.priceDeltaLabel).toBe("+200 ₽ к балансу");
    expect(result.tradeoffText).toBe("По цене выше баланса, проверьте состав.");
  });

  it("shows economical copy only when the budget strategy is cheaper than balanced", () => {
    const balanced = variant("balanced", 1000, baseItems);
    const budget = variant("budget", 760, baseItems);

    const result = getVariantPresentation(budget, [balanced, budget]);

    expect(result.title).toBe("Экономная");
    expect(result.priceDeltaLabel).toBe("−240 ₽ к балансу");
    expect(result.tradeoffText).toBe("Дешевле, но готовки может быть больше.");
  });

  it("does not call a faster variant more expensive when it is cheaper than balanced", () => {
    const balanced = variant("balanced", 1000, baseItems);
    const speed = variant("speed", 900, baseItems);

    const result = getVariantPresentation(speed, [balanced, speed]);

    expect(result.priceDeltaLabel).toBe("−100 ₽ к балансу");
    expect(result.tradeoffText).toBe("Быстрее без переплаты.");
  });

  it("summarizes comparison cards with preview sku, cooking, and meal coverage", () => {
    const balanced = variant("balanced", 1000, baseItems);

    const result = getVariantPresentation(balanced, [balanced]);

    expect(result.previewItems).toEqual(["Куриное филе", "Гречка", "Овощи"]);
    expect(result.cookingLabel).toBe("готовка: средняя");
    expect(result.coverageLabel).toBe("черновик: 4 позиции");
  });
});

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
