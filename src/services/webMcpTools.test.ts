import { describe, expect, it, vi } from "vitest";
import { registerWebMcpTools } from "./webMcpTools";

describe("webMcpTools", () => {
  it("registers Lenta catalog debug tools", async () => {
    const tools = new Map<string, { execute: (input: unknown) => unknown | Promise<unknown> }>();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool: vi.fn((tool) => {
          tools.set(tool.name, tool);
        }),
      },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        mode: "live",
        products: [
          { xmlId: "lenta:1", retailer: "lenta", name: "Молоко Лента", priceRub: 90, sourceQuery: "молоко", isDemo: false },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});

    registerWebMcpTools();
    const result = await tools.get("debug_search_lenta_catalog")?.execute({ query: "молоко", address: "Москва, Тверская 1" });

    expect([...tools.keys()]).toEqual(["get_lenta_catalog_products", "debug_search_lenta_catalog"]);
    expect(fetchMock).toHaveBeenCalledWith("/api/catalog/search", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ query: "молоко", purpose: "debug", sort: "popularity", address: "Москва, Тверская 1" }),
    }));
    expect(result).toEqual({
      mode: "live",
      count: 1,
      products: [{ xmlId: "lenta:1", name: "Молоко Лента", priceRub: 90, priceObservedAt: undefined, storeName: undefined, storeId: undefined }],
    });
  });
});
