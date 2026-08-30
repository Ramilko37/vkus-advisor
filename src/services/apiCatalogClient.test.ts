import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiCatalogClient } from "./catalog";
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
