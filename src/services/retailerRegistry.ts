import definitions from "./retailerRegistryData.json";
import type { CatalogProviderId, CatalogValidationItem, NormalizedProduct, RetailerId } from "../types/domain";

export interface RetailerDefinition {
  id: RetailerId;
  title: string;
  providerPriority: CatalogProviderId[];
  enabled: boolean;
}

export const RETAILER_IDS = Object.keys(definitions) as [RetailerId, ...RetailerId[]];
export const retailerRegistry = Object.fromEntries(RETAILER_IDS.map(id => [id, { id, ...definitions[id] }])) as Record<RetailerId, RetailerDefinition>;
export const DIRECT_RETAILER_IDS = RETAILER_IDS.filter(id => id !== "demo" && definitions[id].providerPriority[0] !== "yandex_eats");
export const MIN_RETAILER_CANDIDATES = 4;

export function catalogProviderFor(product: NormalizedProduct): CatalogProviderId {
  return product.catalogProvider ?? (product.isDemo ? "demo" : retailerRegistry[product.retailer ?? "demo"].providerPriority[0]);
}

export function isYandexEatsProduct(product: Pick<NormalizedProduct, "catalogProvider" | "xmlId">) {
  return product.catalogProvider === "yandex_eats" || product.xmlId.startsWith("yandex_eats:");
}

export function selectProviderForRetailer({ retailer, providerCandidates, minCandidates = MIN_RETAILER_CANDIDATES }: {
  retailer: RetailerId; providerCandidates: NormalizedProduct[]; minCandidates?: number;
}): NormalizedProduct[] {
  const products = Array.from(new Map(providerCandidates.filter(p => (p.retailer ?? "demo") === retailer).map(p => [p.xmlId, p])).values());
  const groups = retailerRegistry[retailer].providerPriority.flatMap(provider => {
    const places = new Map<string, NormalizedProduct[]>();
    for (const product of products.filter(p => catalogProviderFor(p) === provider)) {
      const key = product.retailerPlaceSlug ?? product.storeId ?? "";
      places.set(key, [...(places.get(key) ?? []), product]);
    }
    return [...places.values()].sort((a, b) => b.length - a.length);
  });
  return groups.find(group => group.length >= minCandidates) ?? groups.find(group => isYandexEatsProduct(group[0])) ?? groups[0] ?? [];
}

export function selectCatalogProviders(products: NormalizedProduct[], { finalBaskets = false } = {}) {
  // ponytail: no proven exact Eats lookup yet; enable final baskets only with a verified read-only recheck.
  const eligible = finalBaskets ? products.filter(p => !isYandexEatsProduct(p)) : products;
  return RETAILER_IDS.flatMap(retailer => selectProviderForRetailer({ retailer, providerCandidates: eligible }));
}

export function catalogValidationItem(item: NormalizedProduct & { quantity: number }): CatalogValidationItem {
  return { id: item.id, xmlId: item.xmlId, quantity: item.quantity, priceRub: item.priceRub, name: item.name, retailer: item.retailer, catalogProvider: catalogProviderFor(item), retailerPlaceSlug: item.retailerPlaceSlug };
}

export function yandexEatsStoreUrl(items: Pick<NormalizedProduct, "catalogProvider" | "xmlId" | "retailerPlaceSlug">[]) {
  const slug = items[0]?.retailerPlaceSlug;
  return slug && /^[a-z0-9_-]+$/i.test(slug) && items.every(item => isYandexEatsProduct(item) && item.retailerPlaceSlug === slug)
    ? `https://eda.yandex.ru/retail/${encodeURIComponent(slug)}` : null;
}
