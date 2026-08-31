// @vitest-environment node

import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleRequest } from "../../server.mjs";

describe("DaData server proxy", () => {
  afterEach(() => {
    delete process.env.DADATA_API_KEY;
    vi.unstubAllGlobals();
  });

  it("keeps the API key on the server when suggesting addresses", async () => {
    process.env.DADATA_API_KEY = "server-only-token";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions: [{ value: "г Москва, ул Тверская, д 1" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await post(handleRequest, "/api/address/suggest", { query: "Москва Твер" });

    expect(response).toEqual({ status: 200, body: { suggestions: ["г Москва, ул Тверская, д 1"] } });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Token server-only-token" }),
        body: JSON.stringify({ query: "Москва Твер", count: 5 }),
      }),
    );
  });

  it("reverse geocodes browser coordinates through DaData", async () => {
    process.env.DADATA_API_KEY = "server-only-token";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions: [{ value: "г Москва, ул Петровка, д 17" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await post(handleRequest, "/api/address/geolocate", { lat: 55.76, lon: 37.62 });

    expect(response).toEqual({ status: 200, body: { suggestions: ["г Москва, ул Петровка, д 17"] } });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://suggestions.dadata.ru/suggestions/api/4_1/rs/geolocate/address",
      expect.objectContaining({
        body: JSON.stringify({ lat: 55.76, lon: 37.62, count: 5, radius_meters: 100 }),
      }),
    );
  });

  it("uses DaData coordinates when Nominatim cannot geocode the selected address", async () => {
    process.env.DADATA_API_KEY = "server-only-token";
    const fetchMock = vi.fn().mockImplementation(async (url) => {
      const href = String(url);
      if (href.includes("nominatim")) return { ok: true, status: 200, json: async () => [] };
      if (href.includes("suggestions.dadata.ru")) return {
        ok: true,
        status: 200,
        json: async () => ({ suggestions: [{ value: "г Москва, ул 3-я Бухвостова, влд 1 стр 1", data: { geo_lat: "55.7984", geo_lon: "37.7089" } }] }),
      };
      if (href.includes("/v1/stores/nearest/hub")) return {
        ok: true,
        status: 200,
        json: async () => ({ hubs: [{ aliasId: 1425, name: "ТК1425", address: "Москва, Колодезный переулок, 3", distance: 906 }] }),
      };
      throw new Error(`Unexpected request: ${href}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await post(handleRequest, "/api/catalog/lenta/stores", { address: "г Москва, ул 3-я Бухвостова, влд 1 стр 1" });

    expect(response).toEqual({
      status: 200,
      body: { stores: [{ id: "1425", name: "ТК1425", address: "Москва, Колодезный переулок, 3", distanceMeters: 906 }] },
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("suggestions.dadata.ru"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("latitude=55.7984") && String(url).includes("longitude=37.7089"))).toBe(true);
  });
});

async function post(handleRequest, url, body) {
  const req = Readable.from([JSON.stringify(body)]);
  Object.assign(req, { url, method: "POST", headers: { host: "localhost" } });
  let status = 0;
  let text = "";
  const res = {
    writeHead(nextStatus) { status = nextStatus; },
    end(chunk) { text = String(chunk || ""); },
  };
  await handleRequest(req, res);
  return { status, body: JSON.parse(text) };
}
