import { describe, expect, it, vi } from "vitest";
import { getLentaCatalogLogs, logCatalogProductsSummary, recordLentaCatalogProducts } from "./catalogDebug";

describe("catalogDebug", () => {
  it("records only Lenta products for browser and WebMCP diagnostics", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    recordLentaCatalogProducts("search", [
      { id: "lenta:1", xmlId: "lenta:1", retailer: "lenta", name: "Молоко Лента", priceRub: 90, priceObservedAt: "2026-08-30T05:00:00.000Z", storeName: "ТК124", sourceQuery: "молоко", isDemo: false },
      { id: "42", xmlId: "42", retailer: "vkusvill", name: "Молоко ВкусВилл", priceRub: 100, sourceQuery: "молоко", isDemo: false },
    ], "молоко");

    const lastLog = getLentaCatalogLogs()[getLentaCatalogLogs().length - 1];
    expect(lastLog).toEqual({
      stage: "search",
      query: "молоко",
      count: 1,
      products: [{ xmlId: "lenta:1", name: "Молоко Лента", priceRub: 90, priceObservedAt: "2026-08-30T05:00:00.000Z", storeName: "ТК124", storeId: undefined }],
    });
    expect(log).toHaveBeenCalledWith("lenta_catalog_products", lastLog);
  });

  it("logs retailer counts for every catalog response", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    logCatalogProductsSummary("search", [
      { id: "1", xmlId: "1", retailer: "vkusvill", name: "Товар", priceRub: 1, sourceQuery: "x", isDemo: false },
      { id: "lenta:1", xmlId: "lenta:1", retailer: "lenta", name: "Товар", priceRub: 1, sourceQuery: "x", isDemo: false },
      { id: "lenta:2", xmlId: "lenta:2", retailer: "lenta", name: "Товар", priceRub: 1, sourceQuery: "x", isDemo: false },
    ], "молоко");

    expect(log).toHaveBeenCalledWith("catalog_products_summary", {
      stage: "search",
      query: "молоко",
      total: 3,
      counts: { vkusvill: 1, lenta: 2 },
    });
  });
});
