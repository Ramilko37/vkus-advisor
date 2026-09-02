import type { BasketIntent, BasketItem, BasketItemRole, BasketReasonCode, BasketStrategy, BasketVariant, BasketVariantDraft, NormalizedProduct } from "../types/domain";

export const strategyMetadata = {
  balanced: { title: "Сбалансированная", description: "баланс цены и готовки", prep: { minutes: null, complexity: "medium", label: "готовка: средняя" } },
  economy: { title: "Экономная", description: "минимум стоимости", prep: { minutes: null, complexity: "high", label: "готовка: больше" } },
  fast: { title: "Быстрая", description: "меньше готовки", prep: { minutes: null, complexity: "low", label: "готовка: меньше" } },
} as const;

export const reasonLabels: Record<BasketReasonCode, string> = {
  good_value: "Хорошее соотношение цены и объёма",
  versatile: "Подходит для нескольких блюд",
  high_protein: "Источник белка",
  quick: "Быстро готовится",
  ready_to_eat: "Не требует приготовления",
  breakfast_fit: "Подходит для завтрака",
  adds_variety: "Добавляет разнообразие",
  budget_fit: "Помогает уложиться в бюджет",
  family_fit: "Подходит для общей семейной корзины",
  requested_by_user: "Соответствует запросу пользователя",
};

export const roleLabels: Record<BasketItemRole, string> = {
  breakfast: "Завтрак",
  main: "Основное блюдо",
  protein: "Белок",
  side: "Гарнир",
  vegetables: "Овощи",
  snack: "Перекус",
  ready_food: "Готовая еда",
  drink: "Напиток",
  other: "Другое",
};

export function hydrateAndValidateVariants(
  drafts: BasketVariantDraft[],
  candidates: NormalizedProduct[],
  intent: BasketIntent,
): BasketVariant[] {
  const productMap = new Map(candidates.map((product) => [product.xmlId, product]));
  const retailer = drafts.find((draft) => draft.retailer)?.retailer ?? candidates.find((product) => product.retailer)?.retailer ?? "demo";
  const storeId = candidates.find((product) => product.storeId)?.storeId ?? null;
  const requiredStrategies = ["balanced", "economy", "fast"] as const;
  if (drafts.length !== 3 || new Set(drafts.map((draft) => draft.strategy)).size !== 3) return [];

  const variants = requiredStrategies.flatMap((strategy) => {
    const draft = drafts.find((item) => item.strategy === strategy);
    if (!draft) return [];

    const warnings: string[] = [];
    const merged = new Map<string, BasketItem>();
    for (const item of draft.items.slice(0, 12)) {
      const product = productMap.get(item.xmlId);
      if (!product) {
        warnings.push("Часть товаров удалена: модель сослалась на неизвестные позиции.");
        continue;
      }
      const existing = merged.get(product.xmlId);
      const quantity = Math.min(9, Math.max(1, Math.round(item.quantity)));
      if (existing) {
        existing.quantity = Math.min(9, existing.quantity + quantity);
      } else {
        merged.set(product.xmlId, { ...product, quantity, role: roleLabels[item.role], reason: reasonLabels[item.reasonCode] });
      }
    }

    const items = Array.from(merged.values()).slice(0, 12);
    if (items.length < 4) return [];
    if (merged.size > 12) warnings.push("Вариант ограничен первыми 12 позициями.");
    if ((intent.excludedIngredients.length > 0 || intent.dietaryRestrictions.length > 0) && items.some((item) => !item.composition)) {
      warnings.push("Состав части товаров не проверен: проверьте карточки перед заказом.");
    }
    const totalRub = Math.round(items.reduce((sum, item) => sum + item.priceRub * item.quantity, 0));
    if (intent.budgetRub !== null && totalRub > intent.budgetRub) {
      warnings.push(`Сумма выше бюджета ${intent.budgetRub.toLocaleString("ru-RU")} ₽.`);
    }

    return [{
      id: draft.strategy,
      retailer,
      storeId,
      strategy: draft.strategy,
      title: strategyMetadata[draft.strategy].title,
      strategyDescription: strategyMetadata[draft.strategy].description,
      coverage: buildCoverage(intent),
      constraints: {
        exclusions: [...intent.excludedIngredients],
        dietaryRestrictions: [...intent.dietaryRestrictions],
        hardBudgetRub: intent.budgetIsHard ? intent.budgetRub : null,
      },
      prep: strategyMetadata[draft.strategy].prep,
      tradeoffSummary: "",
      deltaToBalanced: { priceRub: 0 },
      score: 0,
      recommended: false,
      validation: { status: "not_supported" as const, checkedAt: null },
      items,
      totalRub,
      uniqueItemsCount: items.length,
      warnings: Array.from(new Set(warnings)),
    }];
  });

  return scoreBasketVariants(variants, intent);
}

export function scoreBasketVariants(variants: BasketVariant[], intent: BasketIntent): BasketVariant[] {
  const groups = new Map<string, BasketVariant[]>();
  for (const variant of variants) {
    const key = `${variant.retailer}:${variant.storeId ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), variant]);
  }

  return Array.from(groups.values()).flatMap((group) => {
    const balancedTotal = group.find((variant) => variant.strategy === "balanced")?.totalRub ?? group[0]?.totalRub ?? 0;
    const totals = group.map((variant) => variant.totalRub);
    const min = Math.min(...totals);
    const max = Math.max(...totals);
    const spread = max - min;
    const weights = intent.priority === "budget" ? [0.8, 0.2] : intent.priority === "speed" ? [0.2, 0.8] : [0.5, 0.5];
    const scored = group.map((variant) => {
      const priceScore = spread === 0 ? 100 : ((max - variant.totalRub) / spread) * 100;
      const convenienceScore = { economy: 20, balanced: 60, fast: 100 }[variant.strategy];
      const score = Math.round(priceScore * weights[0] + convenienceScore * weights[1]);
      return {
        ...variant,
        tradeoffSummary: tradeoffSummary(variant.strategy, variant.totalRub, balancedTotal),
        deltaToBalanced: { priceRub: variant.totalRub - balancedTotal },
        score,
        recommended: false,
      };
    });
    const rank: Record<BasketStrategy, number> = { balanced: 0, economy: 1, fast: 2 };
    const winner = [...scored].sort((a, b) => b.score - a.score || rank[a.strategy] - rank[b.strategy])[0];
    return scored.map((variant) => ({ ...variant, recommended: variant.id === winner?.id }));
  });
}

function buildCoverage(intent: BasketIntent) {
  const meals = intent.meals.map((type) => ({ type, count: intent.days }));
  const mealLabel = meals.map(({ type, count }) => `${count} ${mealWord(type, count)}`).join(" + ");
  return {
    people: intent.people,
    days: intent.days,
    meals,
    totalMeals: meals.reduce((total, meal) => total + meal.count, 0),
    label: `${mealLabel} · ${intent.people} ${plural(intent.people, ["человек", "человека", "человек"])}`,
  };
}

function mealWord(type: string, count: number) {
  const forms: Record<string, [string, string, string]> = {
    завтрак: ["завтрак", "завтрака", "завтраков"],
    обед: ["обед", "обеда", "обедов"],
    ужин: ["ужин", "ужина", "ужинов"],
    перекус: ["перекус", "перекуса", "перекусов"],
  };
  return plural(count, forms[type.toLocaleLowerCase("ru-RU")] ?? [type, type, type]);
}

function plural(count: number, forms: [string, string, string]) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

function tradeoffSummary(strategy: BasketStrategy, totalRub: number, balancedTotal: number) {
  if (strategy === "balanced") return "Цена и готовка в балансе.";
  if (strategy === "economy") return totalRub < balancedTotal ? "Дешевле, но готовки может быть больше." : "По цене выше баланса, проверьте состав.";
  return totalRub > balancedTotal ? "Дороже, зато быстрее." : "Быстрее без переплаты.";
}
