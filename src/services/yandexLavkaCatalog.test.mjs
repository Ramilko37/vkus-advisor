import { describe, expect, it, vi } from "vitest";
import {
  RetailerAuthError,
  RetailerRateLimitError,
  createYandexLavkaAdapter,
  normalizeYandexLavkaProduct,
} from "./yandexLavkaCatalog.mjs";

const session = {
  cookies: { Session_id: "secret-session", yandexuid: "123" },
  headers: {},
  context: { depotType: "regular", locale: "ru-RU", webCity: "213" },
};

function response(status, data, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] },
    json: async () => data,
    text: async () => typeof data === "string" ? data : JSON.stringify(data),
  };
}

function homepage(token = "csrf-1") {
  return response(200, `<script>{"csrfToken":"${token}"}</script>`);
}

function product(overrides = {}) {
  return {
    id: "a81f329d",
    deepLink: "moloko-prostokvashino-930ml",
    title: "Молоко Простоквашино",
    currentPrice: "99.90",
    oldPrice: 109.9,
    amount: "930 мл",
    available: true,
    ...overrides,
  };
}

describe("Yandex Lavka catalog adapter", () => {
  it("normalizes separate detail and canonical identifiers without exposing raw fields", () => {
    const normalized = normalizeYandexLavkaProduct(product({ internalSecret: "raw" }), "молоко", "2026-09-04T10:00:00.000Z");

    expect(normalized).toEqual({
      id: "lavka:moloko-prostokvashino-930ml",
      xmlId: "lavka:a81f329d",
      retailer: "lavka",
      catalogProvider: "lavka_direct",
      name: "Молоко Простоквашино",
      priceRub: 99.9,
      oldPriceRub: 109.9,
      weightLabel: "930 мл",
      availability: "available",
      sourceQuery: "молоко",
      isDemo: false,
      priceObservedAt: "2026-09-04T10:00:00.000Z",
    });
    expect(normalizeYandexLavkaProduct(product({ id: undefined }), "молоко", "now")).toBeNull();
    expect(normalizeYandexLavkaProduct(product({ deepLink: undefined }), "молоко", "now")).toBeNull();
    expect(normalizeYandexLavkaProduct(product({ currentPrice: 0 }), "молоко", "now")).toBeNull();
    expect(normalizeYandexLavkaProduct(product({ available: undefined }), "молоко", "now")?.availability).toBe("unknown");
  });

  it("resolves address before search and sends [lon, lat] with required session headers", async () => {
    const calls = [];
    const fetchImpl = vi.fn(async (url, init = {}) => {
      calls.push({ url: String(url), init, body: init.body ? JSON.parse(init.body) : undefined });
      if (!init.method || init.method === "GET") return homepage();
      if (String(url).endsWith("/geo/v1/suggest")) return response(200, [{ position: [37.6173, 55.7558] }]);
      if (String(url).endsWith("/geo/v1/geocode")) return response(200, { lon: 37.6173, lat: 55.7558 });
      return response(200, { cacheProducts: [product(), product({ id: "sold", deepLink: "sold", available: false })] });
    });
    const adapter = createYandexLavkaAdapter({ fetchImpl, session, logger: () => {}, now: () => "2026-09-04T10:00:00.000Z" });

    const products = await adapter.searchProducts({ query: "молоко", sort: "popularity" }, "Москва, Тверская 1");

    expect(calls.slice(1).map((call) => call.url.split("/providers/")[1])).toEqual([
      "geo/v1/suggest",
      "geo/v1/geocode",
      "search/v3/lavka",
    ]);
    expect(calls[3].body.position.location).toEqual([37.6173, 55.7558]);
    expect(calls[3].init.headers).toMatchObject({
      "X-CSRF-Token": "csrf-1",
      "X-Requested-With": "XMLHttpRequest",
      "X-Lavka-Web-Locale": "ru-RU",
      "X-Lavka-Web-City": "213",
      "X-Captcha-Service": "lavka",
      "X-Captcha-Language": "ru",
      Origin: "https://lavka.yandex.ru",
      Referer: "https://lavka.yandex.ru/",
      Cookie: expect.stringContaining("Session_id=secret-session"),
    });
    expect(products).toHaveLength(1);
  });

  it("keeps location request-scoped across concurrent searches", async () => {
    const searchLocations = new Map();
    const fetchImpl = async (url, init = {}) => {
      if (!init.method || init.method === "GET") return homepage();
      const body = JSON.parse(init.body);
      if (String(url).endsWith("/geo/v1/suggest")) {
        return response(200, [{ position: body.query.includes("Москва") ? [37.6, 55.7] : [49.1, 55.8] }]);
      }
      if (String(url).endsWith("/geo/v1/geocode")) return response(200, { lon: body.point.lon, lat: body.point.lat });
      searchLocations.set(body.text, body.position.location);
      return response(200, { cacheProducts: [product({ id: body.text, deepLink: body.text })] });
    };
    const adapter = createYandexLavkaAdapter({ fetchImpl, session, logger: () => {} });

    await Promise.all([
      adapter.searchProducts({ query: "молоко", sort: "popularity" }, "Москва, Тверская 1"),
      adapter.searchProducts({ query: "яйца", sort: "popularity" }, "Казань, Баумана 1"),
    ]);

    expect(searchLocations.get("молоко")).toEqual([37.6, 55.7]);
    expect(searchLocations.get("яйца")).toEqual([49.1, 55.8]);
  });

  it("refreshes CSRF once after 401 and raises an auth error after a second 401", async () => {
    let homepageCalls = 0;
    let searchCalls = 0;
    const fetchImpl = async (url, init = {}) => {
      if (!init.method || init.method === "GET") return homepage(`csrf-${++homepageCalls}`);
      if (String(url).endsWith("/geo/v1/suggest")) return response(200, [{ position: [37.6, 55.7] }]);
      if (String(url).endsWith("/geo/v1/geocode")) return response(200, { lon: 37.6, lat: 55.7 });
      searchCalls += 1;
      return response(searchCalls < 2 ? 401 : 200, { cacheProducts: [product()] });
    };
    const adapter = createYandexLavkaAdapter({ fetchImpl, session, logger: () => {} });

    await expect(adapter.searchProducts({ query: "молоко", sort: "popularity" }, "Москва, Тверская 1")).resolves.toHaveLength(1);
    expect(homepageCalls).toBe(2);

    const alwaysUnauthorized = createYandexLavkaAdapter({
      session,
      logger: () => {},
      fetchImpl: async (url, init = {}) => {
        if (!init.method || init.method === "GET") return homepage();
        if (String(url).endsWith("/geo/v1/suggest")) return response(200, [{ position: [37.6, 55.7] }]);
        if (String(url).endsWith("/geo/v1/geocode")) return response(200, { lon: 37.6, lat: 55.7 });
        return response(401, {});
      },
    });
    await expect(alwaysUnauthorized.searchProducts({ query: "молоко", sort: "popularity" }, "Москва, Тверская 1")).rejects.toBeInstanceOf(RetailerAuthError);
  });

  it("returns stale search data with its original timestamp after a temporary failure", async () => {
    let nowMs = 1_000;
    let searchCalls = 0;
    const fetchImpl = async (url, init = {}) => {
      if (!init.method || init.method === "GET") return homepage();
      if (String(url).endsWith("/geo/v1/suggest")) return response(200, [{ position: [37.6, 55.7] }]);
      if (String(url).endsWith("/geo/v1/geocode")) return response(200, { lon: 37.6, lat: 55.7 });
      searchCalls += 1;
      return searchCalls === 1 ? response(200, { cacheProducts: [product()] }) : response(503, {});
    };
    const adapter = createYandexLavkaAdapter({ fetchImpl, session, logger: () => {}, cacheTtlMs: 1, nowMs: () => nowMs, now: () => new Date(nowMs).toISOString() });
    const first = await adapter.searchProducts({ query: "молоко", sort: "popularity" }, "Москва, Тверская 1");
    nowMs = 2_000;

    const stale = await adapter.searchProducts({ query: "молоко", sort: "popularity" }, "Москва, Тверская 1");

    expect(stale[0].priceObservedAt).toBe(first[0].priceObservedAt);
    expect(stale[0].availability).toBe("unknown");
    expect(searchCalls).toBe(3);
  });

  it("uses product slug for fresh validation, preserves xmlId and limits details concurrency to three", async () => {
    let active = 0;
    let maxActive = 0;
    let geoSuggestCalls = 0;
    const detailBodies = [];
    const fetchImpl = async (url, init = {}) => {
      if (!init.method || init.method === "GET") return homepage();
      const body = JSON.parse(init.body);
      if (String(url).endsWith("/geo/v1/suggest")) {
        geoSuggestCalls += 1;
        return response(200, [{ position: [37.6, 55.7] }]);
      }
      if (String(url).endsWith("/geo/v1/geocode")) return response(200, { lon: 37.6, lat: 55.7 });
      detailBodies.push(body);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return response(200, { product: product({ id: `fresh-${body.productId}`, deepLink: body.productId, currentPrice: 101 }) });
    };
    const adapter = createYandexLavkaAdapter({ fetchImpl, session, logger: () => {}, now: () => "2026-09-04T10:05:00.000Z" });
    const items = Array.from({ length: 5 }, (_, index) => ({ id: `lavka:slug-${index}`, xmlId: `lavka:hash-${index}`, quantity: 1, priceRub: 99 }));

    const products = await adapter.verifyCartItems(items, "Москва, Тверская 1");

    expect(detailBodies.map((body) => body.productId)).toEqual(items.map((item) => item.id.replace("lavka:", "")));
    expect(maxActive).toBeLessThanOrEqual(3);
    expect(geoSuggestCalls).toBe(1);
    expect(products.map((item) => item.xmlId)).toEqual(items.map((item) => item.xmlId));
    expect(products.every((item) => item.priceRub === 101)).toBe(true);
  });

  it("never calls cart, orders or payments endpoints and reports 429 distinctly", async () => {
    const urls = [];
    let rateLimit = false;
    const fetchImpl = async (url, init = {}) => {
      urls.push(String(url));
      if (!init.method || init.method === "GET") return homepage();
      if (String(url).endsWith("/geo/v1/suggest")) return response(200, [{ position: [37.6, 55.7] }]);
      if (String(url).endsWith("/geo/v1/geocode")) return response(200, { lon: 37.6, lat: 55.7 });
      if (rateLimit) return response(429, {});
      if (String(url).endsWith("/search/v3/lavka")) return response(200, { cacheProducts: [product()] });
      return response(200, { product: product() });
    };
    const adapter = createYandexLavkaAdapter({ fetchImpl, session, logger: () => {} });
    await adapter.searchProducts({ query: "молоко", sort: "popularity" }, "Москва, Тверская 1");
    await adapter.getProductDetails("lavka:moloko-prostokvashino-930ml", "Москва, Тверская 1");
    await adapter.verifyCartItems([{ id: "lavka:moloko-prostokvashino-930ml", xmlId: "lavka:a81f329d", quantity: 1 }], "Москва, Тверская 1");
    expect(urls.some((url) => /\/providers\/cart\/|\/orders\/|\/payments\//.test(url))).toBe(false);

    rateLimit = true;
    await expect(adapter.searchProducts({ query: "сыр", sort: "popularity" }, "Москва, Тверская 1")).rejects.toBeInstanceOf(RetailerRateLimitError);
  });
});
