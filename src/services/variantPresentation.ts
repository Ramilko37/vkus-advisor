import type { BasketVariant } from "../types/domain";

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

export function getVariantPresentation(variant: BasketVariant): VariantPresentation {
  const delta = variant.deltaToBalanced.priceRub;

  return {
    title: variant.title,
    subtitle: variant.strategyDescription,
    recommendationLabel: variant.recommended ? "Рекомендуем" : null,
    priceDeltaLabel: delta === 0 ? "цена баланса" : `${delta < 0 ? "−" : "+"}${Math.abs(delta).toLocaleString("ru-RU")} ₽ к балансу`,
    tradeoffText: variant.tradeoffSummary,
    cookingLabel: variant.prep.label,
    coverageLabel: variant.coverage.label,
    previewItems: variant.items.slice(0, 3).map((item) => item.name),
  };
}
