import type { BasketItem, NormalizedProduct } from "../types/domain";
import { catalogProviderFor, isYandexEatsProduct } from "./retailerRegistry";

export function replaceBasketItem(items: BasketItem[], candidates: NormalizedProduct[], xmlId: string): BasketItem[] {
  const current = items.find((item) => item.xmlId === xmlId);
  if (!current) return items;
  const used = new Set(items.map((item) => item.xmlId));
  const replacement = candidates.find((product) => !used.has(product.xmlId) && !isYandexEatsProduct(product) && sameRetailer(product, current)
    && catalogProviderFor(product) === catalogProviderFor(current) && product.retailerPlaceSlug === current.retailerPlaceSlug);
  if (!replacement) return items;
  return items.map((item) => item.xmlId === xmlId ? {
    ...replacement,
    quantity: current.quantity,
    role: current.role,
    reason: "Замена из найденных товаров",
  } : item);
}

function sameRetailer(product: NormalizedProduct, item: BasketItem) {
  return !product.retailer || !item.retailer || product.retailer === item.retailer;
}
