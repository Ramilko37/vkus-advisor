import type { BasketIntent, BasketPriority, BasketVariant } from "../types/domain";

export interface VariantPresentation {
  title: string;
  subtitle: string;
  priceDeltaLabel: string;
  priceDeltaTone: "positive" | "warning" | "neutral";
  tradeoffText: string;
  cookingLabel: string;
  itemCountLabel: string;
  previewItems: string[];
}

const axisCopy: Record<BasketPriority, { title: string; subtitle: string; cooking: string; tradeoff: string }> = {
  balanced: { title: "Сбалансированная", subtitle: "баланс цены и готовки", cooking: "средняя готовка", tradeoff: "Цена и готовка в балансе." },
  budget: { title: "Экономная", subtitle: "минимум стоимости", cooking: "больше готовки", tradeoff: "Дешевле, но готовки может быть больше." },
  speed: { title: "Быстрая", subtitle: "меньше готовки", cooking: "меньше готовки", tradeoff: "Дороже, зато быстрее." },
};

export function getVariantPresentation(variant: BasketVariant, variants: BasketVariant[]): VariantPresentation {
  const balancedTotal = variants.find((item) => item.strategy === "balanced")?.totalRub ?? variant.totalRub;
  const delta = variant.totalRub - balancedTotal;
  const economical = variant.strategy !== "budget" || delta < 0;
  const copy = axisCopy[variant.strategy];
  const priceDeltaLabel = delta < 0
    ? `На ${formatRub(Math.abs(delta))} ₽ дешевле`
    : delta > 0
      ? `На ${formatRub(delta)} ₽ дороже`
      : "Цена как у сбалансированной";
  const priceDeltaTone = delta < 0 ? "positive" : delta > 0 ? "warning" : "neutral";
  const tradeoffText = variant.strategy === "speed" && delta <= 0 ? "Быстрее без переплаты." : copy.tradeoff;

  return {
    title: economical ? copy.title : "Альтернатива",
    subtitle: economical ? copy.subtitle : "проверьте состав",
    priceDeltaLabel,
    priceDeltaTone,
    tradeoffText: economical ? tradeoffText : "По цене выше баланса, проверьте состав.",
    cookingLabel: copy.cooking,
    itemCountLabel: `${variant.uniqueItemsCount} ${pluralizeProduct(variant.uniqueItemsCount)}`,
    previewItems: variant.items.slice(0, 3).map((item) => item.name),
  };
}

export function recommendedStrategy(
  intent: BasketIntent,
  variants: BasketVariant[],
): BasketPriority | null {
  const desired = variants.find((variant) => variant.strategy === intent.priority);
  if (!desired) return null;
  return getVariantPresentation(desired, variants).title === "Альтернатива" ? null : desired.strategy;
}

function pluralizeProduct(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "товар";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "товара";
  return "товаров";
}

function formatRub(value: number) {
  return value.toLocaleString("ru-RU").replace(/\u00a0/g, " ");
}
