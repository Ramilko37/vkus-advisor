// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createYandexEatsRetailAdapter, normalizeYandexEatsProduct, resolveYandexEatsRetailer } from "./yandexEatsRetailCatalog.mjs";

const location = { lat: 55.7558, lon: 37.6173 };
const context = { ...location, retailer: "magnit", placeSlug: "magnit_test", placeName: "Магнит", sourceQuery: "молоко" };
const raw = { id: "sku-1", name: "Молоко", price: 89, weight: "930 мл", picture_url: "https://example.com/milk.jpg", available: true, rating: 5 };
const query = { query: "молоко", sort: "popularity" };
const json = (value, status = 200, headers) => new Response(JSON.stringify(value), { status, headers });
const adapter = (options = {}) => createYandexEatsRetailAdapter({ enabled: true, mode: "candidates_only", logger: () => {}, ...options });

describe("Yandex Eats Retail", () => {
  it("normalizes provider/place scoped identity without inventing availability or ratings", () => {
    expect(normalizeYandexEatsProduct(raw, { ...context, priceObservedAt: "2026-09-05T10:00:00.000Z" })).toMatchObject({ id: "yandex_eats:magnit_test:sku-1", xmlId: "yandex_eats:magnit_test:sku-1", retailer: "magnit", catalogProvider: "yandex_eats", retailerPlaceSlug: "magnit_test", name: "Молоко", priceRub: 89, weightLabel: "930 мл", imageUrl: raw.picture_url, availability: "unknown", sourceQuery: "молоко", isDemo: false, priceObservedAt: "2026-09-05T10:00:00.000Z" });
    expect(normalizeYandexEatsProduct(raw, context).rating).toBeUndefined();
    for (const invalid of [{ id: "" }, { name: " " }, { price: null }, { price: true }, { price: -1 }, { price: "no" }]) expect(normalizeYandexEatsProduct({ ...raw, ...invalid }, context)).toBeNull();
  });
  it.each([["magnit_a", "magnit"], ["magnit_semejnyj_a", "magnit_semeiny"], ["perekrestok_a", "perekrestok"], ["metro_a", "metro"], ["ashan_a", "auchan"], ["diksi_a", "dixy"], ["azbukavkusa_a", "azbuka_vkusa"], ["monetka_a", "monetka"], ["super_a", "super_lenta"], ["unknown_a", null]])("maps %s", (placeSlug, expected) => {
    expect(resolveYandexEatsRetailer({ placeSlug })).toBe(expected);
  });
  it("discovers places from links, sends scoped search and sorts locally", async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      if (url.pathname === "/retail") return new Response('<a href="/retail/magnit_test">Магнит</a><a href="/retail/unknown_test">Other</a>');
      expect(url.searchParams.get("latitude")).toBe(String(location.lat));
      expect(url.searchParams.get("longitude")).toBe(String(location.lon));
      expect(url.searchParams.get("placeSlug")).toBe("magnit_test");
      expect(JSON.parse(init.body)).toEqual({ place_slug: "magnit_test", text: "молоко" });
      return json({ payload: { items: [raw, { ...raw, id: "sku-2", price: 50 }] } });
    });
    const api = adapter({ fetchImpl });
    expect(await api.resolveRetailPlaces(location)).toMatchObject([{ retailer: "magnit", placeSlug: "magnit_test" }]);
    expect((await api.searchProducts({ ...query, sort: "price_asc" }, context)).map(p => p.priceRub)).toEqual([50, 89]);
    expect((await api.searchProducts({ ...query, sort: "price_desc" }, context)).map(p => p.priceRub)).toEqual([89, 50]);
    expect((await api.searchProducts(query, context)).map(p => p.priceRub)).toEqual([89, 50]);
    await expect(api.verifyItems([{ xmlId: "yandex_eats:magnit_test:sku-1" }], context)).rejects.toMatchObject({ name: "ProductRecheckUnsupportedError" });
    expect(fetchImpl.mock.calls.every(([url]) => !/cart|checkout/.test(url.pathname))).toBe(true);
  });
  it("isolates caches by coordinates, preserves observed time on stale fallback", async () => {
    let time = 1000;
    let fail = false;
    const fetchImpl = vi.fn(async () => { if (fail) throw new Error("network"); return json({ payload: { items: [raw] } }); });
    const api = adapter({ fetchImpl, nowMs: () => time, searchCacheTtlMs: 100 });
    const first = await api.searchProducts(query, context);
    await api.searchProducts(query, context);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    time += 101;
    fail = true;
    expect(await api.searchProducts(query, context)).toEqual(first);
    await expect(api.searchProducts(query, { ...context, lat: 59.9 })).rejects.toMatchObject({ name: "RetailerUnavailableError" });
  });
  it.each([403, 429])("does not retry HTTP %s and records degraded status", async status => {
    const fetchImpl = vi.fn(async () => json({}, status, { "Retry-After": "60" }));
    const api = adapter({ fetchImpl });
    await expect(api.searchProducts(query, context)).rejects.toBeInstanceOf(Error);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(api.status().connected).toBe(false);
    await expect(api.searchProducts(query, context)).rejects.toBeInstanceOf(Error);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("retries transient responses once, detects captcha and rejects malformed payloads", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json({ payload: { items: [raw] } }));
    expect(await adapter({ fetchImpl }).searchProducts(query, context)).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const api = adapter({ fetchImpl: async () => new Response('<html>SmartCaptcha</html>') });
    await expect(api.resolveRetailPlaces(location)).rejects.toMatchObject({ name: "RetailerCaptchaError" });
    expect(api.status().captchaBlocked).toBe(true);
    await expect(adapter({ fetchImpl: async () => json({ unexpected: [] }) }).searchProducts(query, context)).rejects.toMatchObject({ name: "InvalidRetailerResponseError" });
  });
  it("defaults disabled, cannot enable validated mode, and validates location before I/O", async () => {
    const fetchImpl = vi.fn();
    const disabled = createYandexEatsRetailAdapter({ fetchImpl });
    expect(disabled.status().mode).toBe("disabled");
    await expect(disabled.resolveRetailPlaces(location)).rejects.toBeInstanceOf(Error);
    expect(adapter({ mode: "validated" }).status().mode).toBe("candidates_only");
    await expect(adapter({ fetchImpl }).resolveRetailPlaces({ lat: null, lon: 37 })).rejects.toBeInstanceOf(Error);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("limits concurrent upstream requests across simultaneous searches and caps retailer fan-out", async () => {
    let active = 0;
    let peak = 0;
    const slugs = ["magnit_a", "perekrestok_a", "metro_a", "ashan_a", "diksi_a", "azbukavkusa_a", "magnit_b", "lenta_a"];
    const searched = [];
    const fetchImpl = async (url, init) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 2));
      active--;
      if (url.pathname === "/retail") return new Response(slugs.map(slug => `<a href="/retail/${slug}">Store</a>`).join(""));
      searched.push(JSON.parse(init.body).place_slug);
      return json({ payload: { items: [raw] } });
    };
    const api = adapter({ fetchImpl, concurrency: 3, maxRetailers: 4 });
    const results = await Promise.all(["молоко", "яйца", "сыр"].map(query => api.searchRetailers({ query }, location)));
    expect(peak).toBe(3);
    expect(new Set(searched).size).toBe(4);
    expect(results.every(products => products.length === 4)).toBe(true);
    expect(searched).not.toContain("magnit_b");
  });
  it("skips a sufficient direct catalog and enables its aggregator fallback only when needed", async () => {
    const fetchImpl = async url => url.pathname === "/retail"
      ? new Response('<a href="/retail/lenta_a">Лента</a>')
      : json({ payload: { items: [raw] } });
    const api = adapter({ fetchImpl });
    const direct = [1, 2, 3, 4].map(i => ({ xmlId: `lenta:${i}`, retailer: "lenta", catalogProvider: "lenta_direct" }));
    expect(await api.searchRetailers(query, location, direct)).toEqual([]);
    expect(await api.searchRetailers(query, location, direct.slice(0, 3))).toMatchObject([{ retailer: "lenta", catalogProvider: "yandex_eats" }]);
  });
  it("uses stale place cache only at the same coordinates", async () => {
    let time = 1000;
    let fail = false;
    const api = adapter({ nowMs: () => time, placeCacheTtlMs: 10, fetchImpl: async () => fail ? json({}, 403) : new Response('<a data-place-slug="magnit_a">Магнит</a>') });
    const places = await api.resolveRetailPlaces(location);
    time += 11;
    fail = true;
    expect(await api.resolveRetailPlaces(location)).toEqual(places);
    await expect(api.resolveRetailPlaces({ lat: 59.9, lon: 30.3 })).rejects.toMatchObject({ name: "RetailerAuthError" });
  });
  it("aborts timed out requests and retries at most once", async () => {
    const fetchImpl = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
    const api = adapter({ timeoutMs: 5, fetchImpl });
    await expect(api.searchProducts(query, context)).rejects.toMatchObject({ name: "RetailerTimeoutError" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(api.metrics.timeouts).toBe(2);
  });
  it("records safe transport codes without exposing native error messages", async () => {
    const logger = vi.fn();
    const api = adapter({ logger, fetchImpl: async () => { throw new TypeError("fetch failed", { cause: { code: "ECONNRESET", message: "sensitive upstream context" } }); } });
    await expect(api.resolveRetailPlaces(location)).rejects.toMatchObject({ name: "RetailerUnavailableError" });
    expect(logger).toHaveBeenCalledWith("yandex_eats_request", expect.objectContaining({ networkCode: "ECONNRESET" }));
    expect(JSON.stringify(logger.mock.calls)).not.toContain("sensitive");
  });
  it("follows bounded same-origin retail redirects with the delivery coordinates", async () => {
    const fetchImpl = vi.fn(async url => {
      if (url.pathname === "/retail") return new Response(null, { status: 302, headers: { location: "/moscow/retail" } });
      expect(url.pathname).toBe("/moscow/retail");
      expect(url.searchParams.get("latitude")).toBe(String(location.lat));
      expect(url.searchParams.get("longitude")).toBe(String(location.lon));
      return new Response('<a href="/retail/magnit_test">Магнит</a>');
    });
    expect(await adapter({ fetchImpl }).resolveRetailPlaces(location)).toMatchObject([{ retailer: "magnit", placeSlug: "magnit_test" }]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it.each([["https://smartcaptcha.yandexcloud.net/check?token=private", "RetailerCaptchaError"], ["/api/v1/cart", "InvalidRetailerResponseError"], ["https://example.com/retail", "InvalidRetailerResponseError"]])("does not follow unsafe or captcha redirect %s", async (url, name) => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: url } }));
    await expect(adapter({ fetchImpl }).resolveRetailPlaces(location)).rejects.toMatchObject({ name });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
