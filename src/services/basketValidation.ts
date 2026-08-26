import type { BasketIntent, BasketItem, BasketItemRole, BasketReasonCode, BasketVariant, BasketVariantDraft, NormalizedProduct } from "../types/domain";

export const strategyMetadata = {
  balanced: { title: "Сбалансированная" },
  budget: { title: "Экономная" },
  speed: { title: "Самая простая" },
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
  const requiredStrategies = ["balanced", "budget", "speed"] as const;
  if (drafts.length !== 3 || new Set(drafts.map((draft) => draft.strategy)).size !== 3) return [];

  return requiredStrategies.flatMap((strategy) => {
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
    if (intent.excludedIngredients.length > 0 && items.some((item) => !item.composition)) {
      warnings.push("Состав части товаров не проверен: проверьте карточки перед заказом.");
    }
    const totalRub = Math.round(items.reduce((sum, item) => sum + item.priceRub * item.quantity, 0));
    if (intent.budgetRub !== null && totalRub > intent.budgetRub) {
      warnings.push(`Сумма выше бюджета ${intent.budgetRub.toLocaleString("ru-RU")} ₽.`);
    }

    return [{
      id: draft.strategy,
      strategy: draft.strategy,
      title: strategyMetadata[draft.strategy].title,
      summary: buildVariantSummary(draft.strategy, items.length, totalRub),
      tradeoffs: buildVariantTradeoffs(draft.strategy, intent, totalRub),
      items,
      totalRub,
      uniqueItemsCount: items.length,
      warnings: Array.from(new Set(warnings)),
    }];
  });
}

function buildVariantSummary(strategy: BasketVariant["strategy"], uniqueItemsCount: number, totalRub: number) {
  const rub = totalRub.toLocaleString("ru-RU");
  if (strategy === "budget") return `${uniqueItemsCount} товаров на ${rub} ₽ с акцентом на экономию.`;
  if (strategy === "speed") return `${uniqueItemsCount} товаров на ${rub} ₽ с минимумом приготовления.`;
  return `${uniqueItemsCount} товаров на ${rub} ₽: компромисс цены и удобства.`;
}

function buildVariantTradeoffs(strategy: BasketVariant["strategy"], intent: BasketIntent, totalRub: number) {
  const tradeoffs: string[] = [];
  if (strategy === "balanced") tradeoffs.push("Не самый дешёвый вариант");
  if (strategy === "budget") tradeoffs.push("Может потребоваться больше готовить");
  if (strategy === "speed") tradeoffs.push("Удобство может повысить стоимость");
  if (intent.budgetRub !== null && totalRub > intent.budgetRub) tradeoffs.push("Превышает заданный бюджет");
  return tradeoffs.slice(0, 2);
}
