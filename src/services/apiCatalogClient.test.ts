import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiCatalogClient } from "./catalog";
import { DEFAULT_PROFILE } from "./profileRepository";

describe("ApiCatalogClient", () => {
  it("enables real Eats preview products only when the server flag is on", async () => {
    const candidate = { id: "yandex_eats:magnit_test:1", xmlId: "yandex_eats:magnit_test:1", name: "Молоко", retailer: "magnit", catalogProvider: "yandex_eats", priceRub: 100, sourceQuery: "молоко", isDemo: false };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ mode: "live", products: [], candidateProducts: [candidate], yandexEats: { enabled: true, mode: "candidates_only", connected: true } }) }));
    const client = new ApiCatalogClient();
    expect(await client.searchProducts({ query: "молоко", purpose: "завтрак", sort: "popularity" })).toEqual([candidate]);
    expect(client.allowUnverifiedProducts).toBe(true);
    expect(client.mode).toBe("live");
    expect(client.warnings).toEqual([]);
  });
  it("reports unavailable Eats instead of silently hiding the provider", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ mode: "demo", products: [], yandexEats: { enabled: true, mode: "candidates_only", connected: false } }) }));
    const client = new ApiCatalogClient();
    await client.searchProducts({ query: "молоко", purpose: "завтрак", sort: "popularity" });
    expect(client.warnings).toContain("Товары Яндекс Еды сейчас недоступны. Попробуйте позже.");
  });
  it("passes normalized candidate-only products to source selection without changing catalog mode", async () => {
    const candidate = { id: "yandex_eats:magnit_test:1", xmlId: "yandex_eats:magnit_test:1", name: "Молоко", retailer: "magnit", catalogProvider: "yandex_eats", priceRub: 100, sourceQuery: "молоко", isDemo: false };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ mode: "demo", products: [], candidateProducts: [candidate] }) }));
    const client = new ApiCatalogClient();
    expect(await client.searchProducts({ query: "молоко", purpose: "завтрак", sort: "popularity" })).toEqual([candidate]);
    expect(client.mode).toBe("demo");
  });
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

  it("passes profile address to Lavka product details", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiCatalogClient({ ...DEFAULT_PROFILE, address: "Москва, улица Вавилова, 19" });
    await client.getProductDetails("lavka:moloko");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/catalog/details?id=lavka%3Amoloko&address=%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D0%B0%2C%20%D1%83%D0%BB%D0%B8%D1%86%D0%B0%20%D0%92%D0%B0%D0%B2%D0%B8%D0%BB%D0%BE%D0%B2%D0%B0%2C%2019",
      expect.objectContaining({ method: "GET" }),
    );
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
