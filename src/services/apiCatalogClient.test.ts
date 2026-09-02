import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiCatalogClient, resolveDeliveryContext } from "./catalog";
import { DEFAULT_PROFILE } from "./profileRepository";

describe("ApiCatalogClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps MCP calls behind local catalog API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ mode: "live", products: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiCatalogClient();
    await client.connect();
    await client.searchProducts({ query: "гречка", purpose: "гарнир", sort: "price_asc" });

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(["/api/catalog/status", "/api/catalog/search"]);
  });

  it("passes profile address to catalog search", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ mode: "live", products: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiCatalogClient({ ...DEFAULT_PROFILE, address: "Москва, улица Вавилова, 19" });
    await client.searchProducts({ query: "молоко", purpose: "завтрак", sort: "popularity" });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      query: "молоко",
      address: "Москва, улица Вавилова, 19",
    });
  });

  it("uses the catalog alias from the selected Lenta store name for legacy profiles", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ mode: "live", products: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiCatalogClient({
      ...DEFAULT_PROFILE,
      address: "Москва, улица Вавилова, 19",
      lentaStoreId: "876",
      lentaStoreName: "ТК1425",
      lentaStoreAddress: "Москва, Колодезный переулок, 3",
    });
    await client.searchProducts({ query: "молоко", purpose: "завтрак", sort: "popularity" });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      lentaStoreId: "1425",
      lentaStoreName: "ТК1425",
      lentaStoreAddress: "Москва, Колодезный переулок, 3",
    });
  });

  it("passes profile address to basket validation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ products: [], unavailableXmlIds: ["lenta:404"], changedPrices: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiCatalogClient({ ...DEFAULT_PROFILE, address: "Москва, улица Вавилова, 19" });
    await client.validateBasketItems?.([{ xmlId: "lenta:404", quantity: 1 }]);

    expect(fetchMock.mock.calls[0][0]).toBe("/api/catalog/validate");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      address: "Москва, улица Вавилова, 19",
      items: [{ xmlId: "lenta:404", quantity: 1 }],
    });
  });

  it("logs Lenta products received by search and validation", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          mode: "live",
          products: [
            { xmlId: "lenta:1", retailer: "lenta", name: "Молоко Лента", priceRub: 90, priceObservedAt: "2026-08-30T05:00:00.000Z", storeName: "ТК124" },
            { xmlId: "42", retailer: "vkusvill", name: "Молоко ВкусВилл", priceRub: 100 },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          products: [
            { xmlId: "lenta:1", retailer: "lenta", name: "Молоко Лента", priceRub: 91, priceObservedAt: "2026-08-30T05:01:00.000Z", storeName: "ТК124" },
          ],
          unavailableXmlIds: [],
          changedPrices: [],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiCatalogClient();
    await client.searchProducts({ query: "молоко", purpose: "завтрак", sort: "popularity" });
    await client.validateBasketItems?.([{ xmlId: "lenta:1", quantity: 1, priceRub: 90 }]);

    expect(log).toHaveBeenCalledWith("lenta_catalog_products", {
      stage: "search",
      query: "молоко",
      count: 1,
      products: [{ xmlId: "lenta:1", name: "Молоко Лента", priceRub: 90, priceObservedAt: "2026-08-30T05:00:00.000Z", storeName: "ТК124", storeId: undefined }],
    });
    expect(log).toHaveBeenCalledWith("lenta_catalog_products", {
      stage: "validate",
      count: 1,
      products: [{ xmlId: "lenta:1", name: "Молоко Лента", priceRub: 91, priceObservedAt: "2026-08-30T05:01:00.000Z", storeName: "ТК124", storeId: undefined }],
    });
  });
});

describe("resolveDeliveryContext", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("normalizes the address and reports only actually available retailers", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok({ suggestions: ["г Москва, ул Тверская, д 1"] }))
      .mockResolvedValueOnce(ok({ stores: [] }))
      .mockResolvedValueOnce(ok({
        mode: "live",
        providers: {
          vkusvill: { connected: true },
          lenta: { enabled: true, store: "missing" },
          pyaterochka: { connected: true, store: "resolved" },
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveDeliveryContext("Москва, Тверская 1")).resolves.toEqual({
      status: "ready",
      address: "г Москва, ул Тверская, д 1",
      retailers: ["vkusvill", "pyaterochka"],
    });
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/address/suggest",
      "/api/catalog/lenta/stores",
      "/api/catalog/status?address=%D0%B3%20%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D0%B0%2C%20%D1%83%D0%BB%20%D0%A2%D0%B2%D0%B5%D1%80%D1%81%D0%BA%D0%B0%D1%8F%2C%20%D0%B4%201",
    ]);
  });

  it("does not mark Lenta available without a resolved store id", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok({ suggestions: ["г Москва, ул Тверская, д 1"] }))
      .mockResolvedValueOnce(ok({ stores: [] }))
      .mockResolvedValueOnce(ok({ mode: "demo", providers: { vkusvill: { connected: false }, lenta: { enabled: true }, pyaterochka: { connected: false } } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveDeliveryContext("Москва, Тверская 1")).resolves.toEqual({
      status: "no_retailers",
      address: "г Москва, ул Тверская, д 1",
      retailers: [],
    });
  });

  it("keeps available retailers when Lenta resolution fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok({ suggestions: ["г Москва, ул Тверская, д 1"] }))
      .mockRejectedValueOnce(new Error("Lenta unavailable"))
      .mockResolvedValueOnce(ok({ mode: "live", providers: { vkusvill: { connected: true }, lenta: { enabled: true }, pyaterochka: { connected: false } } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveDeliveryContext("Москва, Тверская 1")).resolves.toEqual({
      status: "ready",
      address: "г Москва, ул Тверская, д 1",
      retailers: ["vkusvill"],
    });
  });
});

function ok(value: unknown) {
  return { ok: true, status: 200, json: async () => value };
}
