// @vitest-environment node

import { Readable } from "node:stream";
import { afterAll, describe, expect, it, vi } from "vitest";

const originalEnv = {
  LAVKA_ENABLED: process.env.LAVKA_ENABLED,
  YANDEX_LAVKA_SESSION_JSON: process.env.YANDEX_LAVKA_SESSION_JSON,
  VKUSVILL_MCP_URL: process.env.VKUSVILL_MCP_URL,
};

process.env.LAVKA_ENABLED = "true";
process.env.YANDEX_LAVKA_SESSION_JSON = JSON.stringify({
  cookies: { Session_id: "secret", yandexuid: "123" },
  headers: {},
  context: { depotType: "regular", locale: "ru-RU", webCity: "213" },
});
process.env.VKUSVILL_MCP_URL = "http://127.0.0.1:1/mcp";

const upstreamCalls = [];
vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => {
  const href = String(url);
  if (href.includes("/mcp")) throw new Error("MCP unavailable");
  upstreamCalls.push({ href, init, body: init.body ? JSON.parse(init.body) : undefined });
  if (href === "https://lavka.yandex.ru/") return response(200, '<script>{"csrfToken":"csrf"}</script>');
  if (href.endsWith("/geo/v1/suggest")) return response(200, [{ position: [37.6173, 55.7558] }]);
  if (href.endsWith("/geo/v1/geocode")) return response(200, { lon: 37.6173, lat: 55.7558 });
  if (href.endsWith("/search/v3/lavka")) return response(200, { cacheProducts: [{
    id: "hash", deepLink: "milk", title: "Молоко", currentPrice: 99.9, available: true,
  }] });
  if (href.endsWith("/providers/v1/product")) return response(200, { product: {
    id: "hash", deepLink: "milk", title: "Молоко", currentPrice: 100, available: true,
  } });
  throw new Error(`Unexpected upstream request: ${href}`);
}));

const { handleRequest } = await import("../../server.mjs?lavka-server-test");

describe("Yandex Lavka server routes", () => {
  afterAll(() => {
    vi.unstubAllGlobals();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("adds Lavka search products without exposing session data", async () => {
    const result = await post("/api/catalog/search", { query: "молоко", sort: "popularity", address: "Москва, Тверская 1" });

    expect(result).toMatchObject({ status: 200, body: { mode: "live", products: [{ id: "lavka:milk", xmlId: "lavka:hash", retailer: "lavka" }] } });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("passes address to details and reports cent-level validation changes", async () => {
    const details = await get("/api/catalog/details?id=lavka%3Amilk&address=Москва%2C%20Тверская%201");
    const validation = await post("/api/catalog/validate", {
      address: "Москва, Тверская 1",
      items: [{ id: "lavka:milk", xmlId: "lavka:hash", quantity: 1, priceRub: 99.99 }],
    });

    expect(details).toMatchObject({ status: 200, body: { id: "lavka:milk", priceRub: 100 } });
    expect(validation.body.changedPrices).toEqual([{ xmlId: "lavka:hash", oldPriceRub: 99.99, newPriceRub: 100 }]);
    expect(upstreamCalls.some((call) => /\/providers\/cart\/|\/orders\/|\/payments\//.test(call.href))).toBe(false);
  });
});

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => undefined },
    text: async () => String(body),
    json: async () => body,
  };
}

async function post(url, body) {
  return request(url, "POST", JSON.stringify(body));
}

async function get(url) {
  return request(url, "GET", "");
}

async function request(url, method, body) {
  const req = Readable.from(body ? [body] : []);
  Object.assign(req, { url, method, headers: { host: "localhost" } });
  let status = 0;
  let text = "";
  const res = { writeHead(value) { status = value; }, end(chunk) { text = String(chunk || ""); } };
  await handleRequest(req, res);
  return { status, body: JSON.parse(text) };
}
