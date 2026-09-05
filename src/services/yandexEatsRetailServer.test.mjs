// @vitest-environment node
import { Readable } from "node:stream";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.stubEnv("YANDEX_EATS_RETAIL_ENABLED", "true");
vi.stubEnv("YANDEX_EATS_RETAIL_MODE", "validated");
vi.stubEnv("LAVKA_ENABLED", "false");
vi.stubEnv("LENTA_ENABLED", "false");
vi.stubEnv("PYATEROCHKA_MCP_URL", "");
vi.stubEnv("VKUSVILL_MCP_URL", "http://127.0.0.1:1/mcp");
vi.stubEnv("DADATA_API_KEY", "test");
const calls = [];
vi.stubGlobal("fetch", vi.fn(async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.pathname.includes("mcp")) throw new Error("unavailable");
  calls.push(url.pathname);
  if (url.hostname === "suggestions.dadata.ru") return Response.json({ suggestions: [{ data: { geo_lat: "55.7558", geo_lon: "37.6173" } }] });
  if (url.pathname === "/retail") return new Response('<a href="/retail/magnit_test">Магнит</a><a href="/retail/metro_test">METRO</a>');
  if (url.pathname === "/api/v1/menu/search") {
    expect(url.searchParams.get("latitude")).toBe("55.7558");
    expect(JSON.parse(init.body).place_slug).toBe(url.searchParams.get("placeSlug"));
    return Response.json({ payload: { items: [{ id: "milk", name: "Молоко", price: 99 }] } });
  }
  throw new Error("Unexpected upstream");
}));
const { handleRequest } = await import("../../server.mjs?eats-server-test");

afterAll(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function request(url, body) {
  const req = Readable.from(body ? [JSON.stringify(body)] : []);
  Object.assign(req, { url, method: body ? "POST" : "GET", headers: { host: "localhost" } });
  let status, result;
  await handleRequest(req, { writeHead(value) { status = value; }, end(value) { result = JSON.parse(String(value)); } });
  return { status, body: result };
}

describe("Eats server integration", () => {
  it("adds distinct retailer identities via existing address geocoder", async () => {
    const result = await request("/api/catalog/search", { query: "молоко", sort: "popularity", address: "Москва, Тверская 1" });
    expect(result.status).toBe(200);
    expect(result.body.mode).toBe("live");
    expect(result.body.candidateProducts.map(p => p.retailer)).toEqual(["magnit", "metro"]);
    expect(result.body.products.some(p => p.catalogProvider === "yandex_eats")).toBe(false);
    expect(result.body.yandexEats.mode).toBe("candidates_only");
  });
  it("fails closed for validation/details/cart without touching other upstream providers", async () => {
    const item = { xmlId: "yandex_eats:magnit_test:milk", retailer: "magnit", catalogProvider: "yandex_eats", retailerPlaceSlug: "magnit_test", quantity: 1 };
    const before = calls.length;
    expect((await request("/api/catalog/validate", { items: [item] })).status).toBe(409);
    expect((await request("/api/catalog/details?id=yandex_eats%3Amagnit_test%3Amilk")).status).toBe(409);
    expect((await request("/api/catalog/cart", { items: [item] })).status).toBe(409);
    expect(calls.length).toBe(before);
    expect(calls.some(path => /cart|checkout/.test(path))).toBe(false);
  });
  it("reports effective mode in health without secrets", async () => {
    const result = await request("/api/health");
    expect(result.body.providers.yandexEats).toMatchObject({ enabled: true, mode: "candidates_only", connected: true, retailerCount: 2 });
    expect(JSON.stringify(result)).not.toContain("cookie");
  });
});
