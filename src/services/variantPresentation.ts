import type { BasketPriority, BasketVariant } from "../types/domain";

export interface VariantPresentation {
  title: string;
  subtitle: string;
  recommendationLabel: string | null;
  priceDeltaLabel: string;
  tradeoffText: string;
  cookingLabel: string;
  coverageLabel: string;
  previewItems: string[];
}

const axisCopy: Record<BasketPriority, { title: string; subtitle: string; cooking: string; tradeoff: string }> = {
  balanced: { title: "Сбалансированная", subtitle: "баланс цены и готовки", cooking: "готовка: средняя", tradeoff: "Цена и готовка в балансе." },
  budget: { title: "Экономная", subtitle: "минимум стоимости", cooking: "готовка: больше", tradeoff: "Дешевле, но готовки может быть больше." },
  speed: { title: "Быстрая", subtitle: "меньше готовки", cooking: "готовка: меньше", tradeoff: "Дороже, зато быстрее." },
};

export function getVariantPresentation(variant: BasketVariant, variants: BasketVariant[]): VariantPresentation {
  const balancedTotal = variants.find((item) => item.strategy === "balanced")?.totalRub ?? variant.totalRub;
  const delta = variant.totalRub - balancedTotal;
  const economical = variant.strategy !== "budget" || delta < 0;
  const copy = axisCopy[variant.strategy];
  const tradeoffText = variant.strategy === "speed" && delta <= 0 ? "Быстрее без переплаты." : copy.tradeoff;

  return {
    title: economical ? copy.title : "Альтернатива",
    subtitle: economical ? copy.subtitle : "проверьте состав",
    recommendationLabel: variant.strategy === "balanced" ? "Рекомендуем" : null,
    priceDeltaLabel: delta === 0 ? "цена баланса" : `${delta < 0 ? "−" : "+"}${Math.abs(delta).toLocaleString("ru-RU")} ₽ к балансу`,
    tradeoffText: economical ? tradeoffText : "По цене выше баланса, проверьте состав.",
    cookingLabel: copy.cooking,
    coverageLabel: `черновик: ${variant.uniqueItemsCount} ${pluralizePosition(variant.uniqueItemsCount)}`,
    previewItems: variant.items.slice(0, 3).map((item) => item.name),
  };
}

function pluralizePosition(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "позиция";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "позиции";
  return "позиций";
}
