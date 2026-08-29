import { describe, expect, it, vi } from "vitest";
import { ApiCatalogClient } from "./catalog";
import { DEFAULT_PROFILE } from "./profileRepository";

describe("ApiCatalogClient", () => {
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
});
