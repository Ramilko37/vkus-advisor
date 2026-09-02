import { describe, expect, it } from "vitest";
import { buildTargetCoverage, hydrateAndValidateVariants, productViolatesConstraints } from "./basketValidation";
import type { BasketIntent, BasketVariantDraft, NormalizedProduct } from "../types/domain";

const intent: BasketIntent = {
  originalRequest: "ужины на 3 дня",
  people: 2,
  days: 3,
  meals: ["ужин"],
  budgetRub: 300,
  budgetIsHard: false,
  maxCookingMinutes: 20,
  excludedIngredients: ["грибы"],
  dietaryRestrictions: [],
  preferences: [],
  readyFoodAllowed: true,
  priority: "balanced",
  needsClarification: false,
  clarificationQuestion: null,
  assumptions: [],
  searchQueries: [],
};

const products: NormalizedProduct[] = [
  { id: "1", xmlId: "1", name: "Гречка", priceRub: 100, composition: "гречневая крупа", sourceQuery: "гречка", isDemo: true },
  { id: "2", xmlId: "2", name: "Котлеты", priceRub: 180, composition: "растительный белок", sourceQuery: "котлеты", isDemo: true },
  { id: "3", xmlId: "3", name: "Грибы", priceRub: 90, composition: "грибы", sourceQuery: "грибы", isDemo: true },
  { id: "4", xmlId: "4", name: "Овощи", priceRub: 120, composition: "морковь, капуста", sourceQuery: "овощи", isDemo: true },
  { id: "5", xmlId: "5", name: "Суп", priceRub: 220, composition: "овощи, вода", sourceQuery: "готовая еда", isDemo: true },
  { id: "6", xmlId: "6", name: "Салат", priceRub: 150, composition: "овощи, зелень", sourceQuery: "овощи", isDemo: true },
  { id: "7", xmlId: "7", name: "Котлеты из говядины", priceRub: 190, composition: "говядина, лук", sourceQuery: "котлеты", isDemo: true },
  { id: "8", xmlId: "8", name: "Рис", priceRub: 80, composition: "рис", sourceQuery: "гарнир", isDemo: true },
  { id: "9", xmlId: "9", name: "Макароны", priceRub: 85, composition: "пшеница", sourceQuery: "гарнир", isDemo: true },
  { id: "10", xmlId: "10", name: "Булгур", priceRub: 95, composition: "пшеница", sourceQuery: "гарнир", isDemo: true },
  { id: "11", xmlId: "11", name: "Молоко без лактозы", priceRub: 110, composition: "безлактозное молоко", sourceQuery: "молоко", isDemo: true },
  { id: "12", xmlId: "12", name: "Макароны без глютена", priceRub: 140, composition: "кукурузная мука, без глютена", sourceQuery: "гарнир", isDemo: true },
  { id: "13", xmlId: "13", name: "Веганский сыр", priceRub: 200, composition: "кокосовое масло, веганский продукт", sourceQuery: "белок", isDemo: true },
];

const coverage = { people: 2, days: 3, meals: [{ type: "ужин", count: 3 }], totalMeals: 3, label: "3 ужина · 2 человека" };

function draft(strategy: BasketVariantDraft["strategy"], items: BasketVariantDraft["items"], prepMinutes = strategy === "fast" ? 10 : strategy === "economy" ? 45 : 30): BasketVariantDraft {
  return { strategy, coverage, prepMinutes, items };
}

describe("hydrateAndValidateVariants", () => {
  it("rejects only the strategy that claims different coverage", () => {
    const items = ["1", "2", "4", "6"].map((xmlId) => ({ xmlId, quantity: 1, role: "main" as const, reasonCode: "good_value" as const }));
    const drafts = [
      { strategy: "balanced", coverage, prepMinutes: 30, items },
      { strategy: "economy", coverage, prepMinutes: 45, items },
      { strategy: "fast", coverage: { ...coverage, days: 2 }, prepMinutes: 10, items },
    ] as unknown as BasketVariantDraft[];

    expect(hydrateAndValidateVariants(drafts, products, { ...intent, budgetIsHard: false }).map((variant) => variant.strategy)).toEqual([
      "balanced",
      "economy",
    ]);
  });

  it("rejects a strategy that references an unknown SKU", () => {
    const validItems = ["1", "2", "4", "6"].map((xmlId) => ({ xmlId, quantity: 1, role: "main" as const, reasonCode: "good_value" as const }));
    const withUnknownSku = [...validItems, { xmlId: "404", quantity: 1, role: "main" as const, reasonCode: "good_value" as const }];

    const variants = hydrateAndValidateVariants([
      draft("balanced", validItems),
      draft("economy", withUnknownSku),
      draft("fast", validItems),
    ], products, intent);

    expect(variants.map((variant) => variant.strategy)).toEqual(["balanced", "fast"]);
  });

  it("rejects only a strategy that contains an excluded ingredient", () => {
    const safeItems = ["1", "2", "4", "6"].map((xmlId) => ({ xmlId, quantity: 1, role: "main" as const, reasonCode: "good_value" as const }));
    const mushroomItems = ["1", "2", "3", "4"].map((xmlId) => ({ xmlId, quantity: 1, role: "main" as const, reasonCode: "good_value" as const }));

    const variants = hydrateAndValidateVariants([
      draft("balanced", safeItems),
      draft("economy", mushroomItems),
      draft("fast", safeItems),
    ], products, intent);

    expect(variants.map((variant) => variant.strategy)).toEqual(["balanced", "fast"]);
  });

  it("matches excluded ingredients across Russian word forms", () => {
    expect(productViolatesConstraints(products[2], { ...intent, excludedIngredients: ["грибов"] })).toBe(true);
    expect(productViolatesConstraints({ ...products[10], name: "Молоко", composition: "молоко" }, { ...intent, excludedIngredients: ["молока"] })).toBe(true);
  });

  it("accepts explicit free-from and vegan labels but rejects an unverifiable composition", () => {
    expect(productViolatesConstraints(products[10], { ...intent, excludedIngredients: [], dietaryRestrictions: ["без лактозы"] })).toBe(false);
    expect(productViolatesConstraints(products[11], { ...intent, excludedIngredients: [], dietaryRestrictions: ["без глютена"] })).toBe(false);
    expect(productViolatesConstraints(products[12], { ...intent, excludedIngredients: [], dietaryRestrictions: ["веганство"] })).toBe(false);
    expect(productViolatesConstraints({ ...products[12], composition: "говядина, яйцо" }, { ...intent, excludedIngredients: [], dietaryRestrictions: ["веганство"] })).toBe(true);
    expect(productViolatesConstraints({ ...products[3], composition: undefined }, { ...intent, excludedIngredients: [], dietaryRestrictions: ["вегетарианство"] })).toBe(true);
  });

  it("rejects only a strategy that exceeds a hard budget", () => {
    const affordableItems = ["1", "2", "4", "6"].map((xmlId) => ({ xmlId, quantity: 1, role: "main" as const, reasonCode: "good_value" as const }));
    const expensiveItems = ["1", "2", "4", "6"].map((xmlId) => ({ xmlId, quantity: 2, role: "main" as const, reasonCode: "good_value" as const }));

    const variants = hydrateAndValidateVariants([
      draft("balanced", expensiveItems),
      draft("economy", affordableItems),
      draft("fast", affordableItems),
    ], products, { ...intent, budgetRub: 600, budgetIsHard: true });

    expect(variants.map((variant) => variant.strategy)).toEqual(["economy", "fast"]);
  });

  it("rejects only a strategy that violates an explicit dietary restriction", () => {
    const vegetarianItems = ["1", "4", "5", "6"].map((xmlId) => ({ xmlId, quantity: 1, role: "main" as const, reasonCode: "good_value" as const }));
    const meatItems = ["1", "4", "6", "7"].map((xmlId) => ({ xmlId, quantity: 1, role: "main" as const, reasonCode: "good_value" as const }));

    const variants = hydrateAndValidateVariants([
      draft("balanced", vegetarianItems),
      draft("economy", meatItems),
      draft("fast", vegetarianItems),
    ], products, { ...intent, dietaryRestrictions: ["вегетарианство"] });

    expect(variants.map((variant) => variant.strategy)).toEqual(["balanced", "fast"]);
  });

  it("rejects a grain-dominated basket instead of calling it full dinners", () => {
    const fullDinnerItems = ["1", "2", "4", "6"].map((xmlId) => ({ xmlId, quantity: 1, role: "main" as const, reasonCode: "good_value" as const }));
    const grainItems = ["2", "8", "9", "10"].map((xmlId) => ({ xmlId, quantity: 1, role: "main" as const, reasonCode: "good_value" as const }));

    const variants = hydrateAndValidateVariants([
      draft("balanced", fullDinnerItems),
      draft("economy", grainItems),
      draft("fast", fullDinnerItems),
    ], products, intent);

    expect(variants.map((variant) => variant.strategy)).toEqual(["balanced", "fast"]);
  });

  it("keeps three strategies, merges duplicates, clamps quantities and recalculates totals", () => {
    const drafts: BasketVariantDraft[] = [
      draft("balanced", [{ xmlId: "1", quantity: 10, role: "side", reasonCode: "versatile" }, { xmlId: "1", quantity: 2, role: "side", reasonCode: "versatile" }, { xmlId: "2", quantity: 1, role: "protein", reasonCode: "high_protein" }, { xmlId: "4", quantity: 1, role: "vegetables", reasonCode: "adds_variety" }, { xmlId: "6", quantity: 1, role: "vegetables", reasonCode: "adds_variety" }]),
      draft("economy", [{ xmlId: "1", quantity: 1, role: "side", reasonCode: "budget_fit" }, { xmlId: "2", quantity: 1, role: "protein", reasonCode: "good_value" }, { xmlId: "4", quantity: 1, role: "vegetables", reasonCode: "good_value" }, { xmlId: "6", quantity: 1, role: "vegetables", reasonCode: "good_value" }]),
      draft("fast", [{ xmlId: "2", quantity: 1, role: "main", reasonCode: "quick" }, { xmlId: "1", quantity: 1, role: "side", reasonCode: "versatile" }, { xmlId: "5", quantity: 1, role: "ready_food", reasonCode: "ready_to_eat" }, { xmlId: "6", quantity: 1, role: "vegetables", reasonCode: "quick" }]),
    ];

    const variants = hydrateAndValidateVariants(drafts, products, intent);
    expect(variants).toHaveLength(3);
    expect(variants[0].items[0].quantity).toBe(9);
    expect(variants[0].totalRub).toBe(1350);
    expect(variants[1].items[0].reason).toBe("Помогает уложиться в бюджет");
    expect(variants[0].warnings.some((warning) => warning.includes("выше бюджета"))).toBe(true);
  });

  it("rejects duplicate strategies", () => {
    const items = ["1", "2", "4", "6"].map((xmlId) => ({ xmlId, quantity: 1, role: "side" as const, reasonCode: "good_value" as const }));
    expect(hydrateAndValidateVariants([
      draft("balanced", items),
      draft("balanced", items),
      draft("fast", items),
    ], products, intent).map((variant) => variant.strategy)).toEqual(["fast"]);
  });

  it("keeps scenario titles and summaries honest against the balanced price", () => {
    const balancedItems = ["1", "2", "4", "6"].map((xmlId) => ({ xmlId, quantity: 1, role: "side" as const, reasonCode: "good_value" as const }));
    const expensiveBudgetItems = ["2", "4", "5", "6"].map((xmlId) => ({ xmlId, quantity: 1, role: "side" as const, reasonCode: "good_value" as const }));

    const variants = hydrateAndValidateVariants([
      draft("balanced", balancedItems),
      draft("economy", expensiveBudgetItems),
      draft("fast", expensiveBudgetItems),
    ], products, intent);

    expect(variants.find((variant) => variant.strategy === "economy")?.title).toBe("Экономная");
    expect(variants.find((variant) => variant.strategy === "economy")?.tradeoffSummary).toBe("По цене выше баланса, проверьте состав.");
  });

  it("does not describe the speed variant as more expensive when it is cheaper than balanced", () => {
    const balancedItems = ["1", "2", "4", "6"].map((xmlId) => ({ xmlId, quantity: 1, role: "side" as const, reasonCode: "good_value" as const }));
    const speedItems = ["1", "2", "4", "6"].map((xmlId) => ({ xmlId, quantity: 1, role: "side" as const, reasonCode: "good_value" as const }));

    const variants = hydrateAndValidateVariants([
      draft("balanced", balancedItems),
      draft("economy", speedItems),
      draft("fast", speedItems),
    ], products, intent);

    expect(variants.find((variant) => variant.strategy === "fast")?.tradeoffSummary).toBe("Быстрее без переплаты.");
  });

  it("scores speed from declared prep time rather than the strategy name", () => {
    const balancedItems = ["1", "2", "4", "6"].map((xmlId) => ({ xmlId, quantity: 2, role: "main" as const, reasonCode: "good_value" as const }));
    const quickItems = ["1", "2", "4", "6"].map((xmlId) => ({ xmlId, quantity: 1, role: "main" as const, reasonCode: "quick" as const }));

    const variants = hydrateAndValidateVariants([
      draft("balanced", balancedItems, 30),
      draft("economy", quickItems, 5),
      draft("fast", quickItems, 10),
    ], products, { ...intent, priority: "speed" });

    expect(variants.find((variant) => variant.recommended)?.strategy).toBe("economy");
  });

  it("returns Compare-ready variants with shared request invariants and a scored recommendation", () => {
    const variants = hydrateAndValidateVariants([
      draft("balanced", ["2", "4", "5", "6"].map((xmlId) => ({ xmlId, quantity: 2, role: "main" as const, reasonCode: "good_value" as const }))),
      draft("economy", ["1", "2", "4", "6"].map((xmlId) => ({ xmlId, quantity: 1, role: "main" as const, reasonCode: "budget_fit" as const }))),
      draft("fast", ["2", "4", "5", "6"].map((xmlId) => ({ xmlId, quantity: 2, role: "ready_food" as const, reasonCode: "quick" as const }))),
    ], products, { ...intent, originalRequest: "Ужины на 3 дня для двоих до 3000 ₽ без грибов", budgetRub: 3000, budgetIsHard: true, priority: "budget" });

    expect(variants.map((variant) => variant.strategy)).toEqual(["balanced", "economy", "fast"]);
    expect(variants.every((variant) => variant.coverage.label === "3 ужина · 2 человека")).toBe(true);
    expect(variants.every((variant) => variant.constraints.hardBudgetRub === 3000)).toBe(true);
    expect(variants.every((variant) => variant.constraints.exclusions.includes("грибы"))).toBe(true);
    expect(variants.map((variant) => variant.tradeoffSummary)).toHaveLength(3);
    expect(variants.filter((variant) => variant.recommended).map((variant) => variant.strategy)).toEqual(["economy"]);
  });

  it.each([
    { request: "Ужины на 3 дня для двоих до 3000 ₽ без грибов", days: 3, people: 2, meals: ["ужин"], budgetRub: 3000, exclusions: ["грибов"], diet: [], priority: "budget" },
    { request: "Вегетарианские завтраки на 5 дней для одного", days: 5, people: 1, meals: ["завтрак"], budgetRub: 1800, exclusions: [], diet: ["вегетарианство"], priority: "balanced" },
    { request: "Обеды и ужины на 2 дня для четверых до 5000 ₽", days: 2, people: 4, meals: ["обед", "ужин"], budgetRub: 5000, exclusions: [], diet: [], priority: "budget" },
    { request: "Ужины на неделю для одного без лактозы", days: 7, people: 1, meals: ["ужин"], budgetRub: 2500, exclusions: [], diet: ["без лактозы"], priority: "balanced" },
    { request: "Завтраки и перекусы на 2 дня для троих без глютена", days: 2, people: 3, meals: ["завтрак", "перекус"], budgetRub: 2500, exclusions: [], diet: ["без глютена"], priority: "speed" },
  ] as const)("keeps all three strategies valid for regression: $request", ({ request, days, people, meals, budgetRub, exclusions, diet, priority }) => {
    const regressionIntent: BasketIntent = {
      ...intent,
      originalRequest: request,
      days,
      people,
      meals: [...meals],
      budgetRub,
      budgetIsHard: true,
      excludedIngredients: [...exclusions],
      dietaryRestrictions: [...diet],
      priority,
    };
    const regressionCoverage = buildTargetCoverage(regressionIntent);
    const safeItems = ["1", "4", "5", "6"].map((xmlId) => ({ xmlId, quantity: 1, role: "main" as const, reasonCode: "good_value" as const }));
    const regressionDraft = (strategy: BasketVariantDraft["strategy"], quantity: number, prepMinutes: number): BasketVariantDraft => ({
      strategy,
      coverage: regressionCoverage,
      prepMinutes,
      items: safeItems.map((item) => ({ ...item, quantity })),
    });

    const variants = hydrateAndValidateVariants([
      regressionDraft("balanced", 2, 30),
      regressionDraft("economy", 1, 45),
      regressionDraft("fast", 1, 10),
    ], products, regressionIntent, regressionCoverage);

    expect(variants.map((variant) => variant.strategy)).toEqual(["balanced", "economy", "fast"]);
    expect(variants.every((variant) => JSON.stringify(variant.coverage) === JSON.stringify(regressionCoverage))).toBe(true);
    expect(variants.every((variant) => variant.totalRub <= budgetRub)).toBe(true);
    expect(variants.find((variant) => variant.strategy === "economy")!.totalRub).toBeLessThan(variants.find((variant) => variant.strategy === "balanced")!.totalRub);
    expect(variants.find((variant) => variant.strategy === "fast")!.prep.minutes).toBeLessThan(variants.find((variant) => variant.strategy === "balanced")!.prep.minutes!);
    expect(variants.every((variant) => variant.items.every((item) => item.xmlId !== "3"))).toBe(true);
  });
});
