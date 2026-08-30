import { describe, expect, it } from "vitest";
import { createLentaCatalogAdapter, normalizeLentaProduct, resolveLentaRetailBrand } from "./lentaCatalog.mjs";

function okJson(data) {
  return { ok: true, status: 200, json: async () => data };
}

describe("Lenta catalog adapter", () => {
  it("maps retailBrand values for Lenta, Monetka and Utkonos", () => {
    expect(resolveLentaRetailBrand("Лента")).toBe("lo");
    expect(resolveLentaRetailBrand("Монетка")).toBe("mntk");
    expect(resolveLentaRetailBrand("Утконос")).toBe("utk");
  });

  it("normalizes Lenta price and availability fields without exposing raw data", () => {
    const product = normalizeLentaProduct({
      id: 80424,
      name: "Молоко пастеризованное ЛЕНТА 2,5%, 900мл",
      price: { current: 91, old: 109 },
      loyaltyPrice: 89,
      brand: "Лента",
      available: true,
      images: [{ medium: "milk.webp" }],
    }, "молоко", "2026-08-29T10:00:00.000Z");

    expect(product).toMatchObject({
      xmlId: "lenta:80424",
      priceRub: 91,
      oldPriceRub: 109,
      loyaltyPriceRub: 89,
      availability: "available",
      priceObservedAt: "2026-08-29T10:00:00.000Z",
    });
    expect(Object.keys(product)).not.toContain("raw");
    expect(normalizeLentaProduct({ id: 1, name: "Без цены" }, "молоко", "2026-08-29T10:00:00.000Z")).toBeNull();
  });

  it("normalizes real Lenta catalog prices from kopecks", () => {
    const product = normalizeLentaProduct({
      id: 80424,
      name: "Молоко пастеризованное ПРОСТОКВАШИНО 2,5%, без змж, 930мл",
      prices: {
        price: 9999,
        priceRegular: 10999,
      },
    }, "молоко", "2026-08-29T10:00:00.000Z");

    expect(product).toMatchObject({
      xmlId: "lenta:80424",
      priceRub: 99.99,
      oldPriceRub: 109.99,
      availability: "unknown",
    });
  });

  it("chooses the nearest store for the address before searching products", async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(String(url));
      if (String(url).includes("nominatim")) return okJson([{ lat: "55.7558", lon: "37.6173" }]);
      if (String(url).includes("/v1/stores/nearest/hub")) return okJson({ hubs: [
        { id: 3560, address: "Москва, 3-я Владимирская улица, 23", distance: 10823 },
        { id: 525, name: "ТК1453", address: "Москва, Овчинниковская наб., 22/24с1", distance: 1127 },
      ] });
      return okJson({ items: [{ id: 524158, name: "Молоко Лента 2,5%", price: { current: 91 }, images: [{ medium: "milk.webp" }] }] });
    };

    const adapter = createLentaCatalogAdapter({ fetchImpl, now: () => "2026-08-29T10:00:00.000Z", logger: () => {} });
    const products = await adapter.searchProducts({ query: "молоко", sort: "popularity" }, "Москва, Тверская 1");

    expect(calls[0]).toContain("/search?");
    expect(calls[1]).toContain("/v1/stores/nearest/hub");
    expect(calls[2]).toContain("/catalog/v1/items?");
    expect(calls[2]).toContain("stores=525");
    expect(calls[2]).toContain("channel=lo");
    expect(calls[2]).toContain("retailBrand=lo");
    expect(products[0]).toMatchObject({
      xmlId: "lenta:524158",
      retailer: "lenta",
      priceRub: 91,
      storeId: "525",
      storeName: "ТК1453",
      priceObservedAt: "2026-08-29T10:00:00.000Z",
    });
  });

  it("lists nearby stores for explicit user selection without searching products", async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(String(url));
      if (String(url).includes("nominatim")) return okJson([{ lat: "55.7558", lon: "37.6173" }]);
      return okJson({ hubs: [
        { id: 876, aliasId: 1425, name: "ТК1425", address: "Москва, Колодезный переулок, 3", distance: 812 },
        { id: 3560, name: "ТК1900", address: "Москва, 3-я Владимирская улица, 23", distance: 10823 },
      ] });
    };
    const adapter = createLentaCatalogAdapter({ fetchImpl, logger: () => {} });

    const stores = await adapter.listStores("Москва, Тверская 1");

    expect(stores).toEqual([
      { id: "1425", name: "ТК1425", address: "Москва, Колодезный переулок, 3", distanceMeters: 812 },
      { id: "3560", name: "ТК1900", address: "Москва, 3-я Владимирская улица, 23", distanceMeters: 10823 },
    ]);
    expect(calls).toHaveLength(2);
    expect(calls.some((url) => url.includes("/catalog/v1/items"))).toBe(false);
  });

  it("uses the last valid product cache when Lenta API becomes unavailable", async () => {
    let nowMs = 1_000;
    let itemsCalls = 0;
    const fetchImpl = async (url) => {
      const href = String(url);
      if (href.includes("nominatim")) return okJson([{ lat: "55.7558", lon: "37.6173" }]);
      if (href.includes("/v1/stores/nearest/hub")) return okJson({ hubs: [{ id: 525 }] });
      itemsCalls += 1;
      if (itemsCalls > 1) throw new Error("network down");
      return okJson({ items: [{ id: 524158, name: "Молоко", price: 91 }] });
    };
    const adapter = createLentaCatalogAdapter({
      fetchImpl,
      now: () => new Date(nowMs).toISOString(),
      nowMs: () => nowMs,
      cacheTtlMs: 1,
      logger: () => {},
    });

    await adapter.searchProducts({ query: "молоко", sort: "popularity" }, "Москва, Тверская 1");
    nowMs = 2_000;

    const products = await adapter.searchProducts({ query: "молоко", sort: "popularity" }, "Москва, Тверская 1");

    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({ xmlId: "lenta:524158", priceObservedAt: "1970-01-01T00:00:01.000Z" });
  });

  it("falls back to the next nearest store when the closest store has an empty delivery catalog", async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      const href = String(url);
      calls.push(href);
      if (href.includes("nominatim")) return okJson([{ lat: "55.8078", lon: "37.6387" }]);
      if (href.includes("/v1/stores/nearest/hub")) return okJson({ hubs: [
        { id: 388, address: "Москва, Павла Корчагина ул., 3А", distance: 1297 },
        { id: 525, address: "Москва, Овчинниковская наб., 22/24с1", distance: 1708 },
      ] });
      if (href.includes("stores=388")) return okJson({ items: [], total: 0 });
      return okJson({ items: [{ id: 80424, name: "Молоко", price: 91 }] });
    };

    const adapter = createLentaCatalogAdapter({ fetchImpl, logger: () => {} });
    const products = await adapter.searchProducts({ query: "молоко", sort: "popularity" }, "Москва, проспект Мира");

    expect(calls.some((url) => url.includes("stores=388"))).toBe(true);
    expect(calls.some((url) => url.includes("stores=525"))).toBe(true);
    expect(products[0]).toMatchObject({ xmlId: "lenta:80424" });
    expect(adapter.currentStoreId).toBe("525");
  });

  it("rechecks selected Lenta SKUs by ids for cart validation", async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(String(url));
      if (String(url).includes("nominatim")) return okJson([{ lat: "55.7558", lon: "37.6173" }]);
      if (String(url).includes("/v1/stores/nearest/hub")) return okJson({ hubs: [{ id: 525 }] });
      return okJson({ items: [{ id: 524158, name: "Молоко", price: 91 }] });
    };

    const adapter = createLentaCatalogAdapter({ fetchImpl, now: () => "2026-08-29T10:00:00.000Z", logger: () => {} });
    const products = await adapter.verifyCartItems([{ xmlId: "lenta:524158", quantity: 2 }], "Москва, Тверская 1");

    expect(calls.at(-1)).toContain("ids=524158");
    expect(products[0]).toMatchObject({ xmlId: "lenta:524158", priceObservedAt: "2026-08-29T10:00:00.000Z" });
  });
});
