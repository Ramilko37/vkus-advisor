import { describe, expect, it } from "vitest";
import { RETAILER_IDS, selectProviderForRetailer, selectCatalogProviders, catalogValidationItem, yandexEatsStoreUrl } from "./retailerRegistry";
import type { NormalizedProduct } from "../types/domain";

function pool(provider: string, count: number, place = "lenta_one") {
  return Array.from({ length: count }, (_, i) => ({ id: `${provider}:${place}:${i}`, xmlId: `${provider}:${place}:${i}`, retailer: "lenta", catalogProvider: provider, retailerPlaceSlug: provider === "yandex_eats" ? place : undefined, name: "Молоко", priceRub: 90, sourceQuery: "молоко", isDemo: false })) as NormalizedProduct[];
}

describe("retailer source selection", () => {
  it("keeps sufficient direct catalog, otherwise selects one aggregator place", () => {
    expect(RETAILER_IDS).toContain("magnit");
    const direct = pool("lenta_direct", 4);
    const aggregator = pool("yandex_eats", 5);
    expect(selectProviderForRetailer({ retailer: "lenta", providerCandidates: [...aggregator, ...direct] })).toEqual(direct);
    expect(selectProviderForRetailer({ retailer: "lenta", providerCandidates: [...direct.slice(0, 3), ...aggregator, ...pool("yandex_eats", 2, "lenta_two")] })).toEqual(aggregator);
  });
  it("counts distinct SKUs and excludes candidate-only sources from production selection", () => {
    const direct = pool("lenta_direct", 3);
    const aggregator = pool("yandex_eats", 5);
    expect(selectProviderForRetailer({ retailer: "lenta", providerCandidates: [...direct, ...direct, ...aggregator] })).toEqual(aggregator);
    expect(selectCatalogProviders([...direct, ...aggregator], { finalBaskets: true })).toEqual(direct);
  });
  it("preserves source context for validation and only opens one safe store URL", () => {
    const product = pool("yandex_eats", 1)[0];
    expect(catalogValidationItem({ ...product, quantity: 2 })).toMatchObject({ xmlId: product.xmlId, quantity: 2, name: "Молоко", retailer: "lenta", catalogProvider: "yandex_eats", retailerPlaceSlug: "lenta_one" });
    expect(yandexEatsStoreUrl([product])).toBe("https://eda.yandex.ru/retail/lenta_one");
    expect(yandexEatsStoreUrl([product, ...pool("yandex_eats", 1, "lenta_two")])).toBeNull();
    expect(yandexEatsStoreUrl([{ ...product, retailerPlaceSlug: "../../checkout" }])).toBeNull();
    expect(yandexEatsStoreUrl([])).toBeNull();
  });
});
