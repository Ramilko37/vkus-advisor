import { RETAILERS, type CheckoutCapability, type RetailerKey } from "../config/retailers";
import type { BasketVariant, RetailerResult } from "../types/domain";

export type RetailerOption = {
  key: RetailerKey;
  label: string;
  capability: CheckoutCapability;
  capabilityLabel: string;
  minPriceRub: number;
  variants: BasketVariant[];
  result?: RetailerResult;
};

export function buildRetailerOptions(
  variants: BasketVariant[],
  retailerResults: RetailerResult[] = [],
): RetailerOption[] {
  const resultMap = new Map(retailerResults.map((result) => [result.retailer, result]));
  const grouped = new Map<RetailerKey, BasketVariant[]>();

  for (const variant of variants) {
    const key = variant.retailer ?? "demo";
    grouped.set(key, [...(grouped.get(key) ?? []), variant]);
  }

  return Array.from(grouped, ([key, group]) => ({
    key,
    label: RETAILERS[key].label,
    capability: RETAILERS[key].capability,
    capabilityLabel: RETAILERS[key].capabilityLabel,
    minPriceRub: Math.min(...group.map((variant) => variant.totalRub)),
    variants: group,
    result: resultMap.get(key),
  }))
    .filter((option) => option.variants.length > 0 && option.result?.status !== "failed")
    .sort((left, right) => left.minPriceRub - right.minPriceRub || left.label.localeCompare(right.label, "ru"));
}
