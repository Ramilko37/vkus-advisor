import retailers from "./retailerRegistryData.json" with { type: "json" };

class RetailerError extends Error {
  constructor(message, status) { super(message); this.name = new.target.name; this.status = status; }
}
export class RetailerTimeoutError extends RetailerError { constructor() { super("Yandex Eats request timed out", 504); } }
export class RetailerUnavailableError extends RetailerError { constructor(status = 503) { super("Yandex Eats unavailable", status); } }
export class RetailerRateLimitError extends RetailerError { constructor(retryAfter) { super("Yandex Eats rate limited", 429); this.retryAfter = retryAfter; } }
export class RetailerAuthError extends RetailerError { constructor() { super("Yandex Eats denied anonymous access", 403); } }
export class RetailerCaptchaError extends RetailerError { constructor() { super("Yandex Eats captcha blocked", 403); } }
export class InvalidRetailerResponseError extends RetailerError { constructor() { super("Invalid Yandex Eats response", 502); } }
export class RetailPlaceNotFoundError extends RetailerError { constructor() { super("No supported retail places found", 404); } }
export class ProductRecheckUnsupportedError extends RetailerError { constructor() { super("Exact read-only Yandex Eats SKU recheck is not proven", 409); } }

const slugPattern = /^[a-z0-9_-]{1,160}$/i;
const prefixes = [
  ["magnit_semejnyj", "magnit_semeiny"], ["pyaterochka", "pyaterochka"], ["magnit", "magnit"],
  ["perekrestok", "perekrestok"], ["azbukavkusa", "azbuka_vkusa"], ["vkusvill", "vkusvill"],
  ["lenta", "lenta"], ["super", "super_lenta"], ["metro", "metro"], ["ashan", "auchan"], ["diksi", "dixy"], ["monetka", "monetka"],
];

export function resolveYandexEatsRetailer(place) {
  const slug = String(place?.placeSlug ?? place?.slug ?? "").toLowerCase();
  return prefixes.find(([prefix]) => slug === prefix || slug.startsWith(`${prefix}_`) || (prefix === "pyaterochka" && slug.startsWith(prefix)))?.[1] ?? null;
}

export function normalizeYandexEatsProduct(raw, context) {
  const sku = typeof raw?.id === "string" || typeof raw?.id === "number" ? String(raw.id).trim() : "";
  const name = typeof raw?.name === "string" ? raw.name.trim() : "";
  const priceRub = typeof raw?.price === "number" || (typeof raw?.price === "string" && /^\d+(?:[.,]\d+)?$/.test(raw.price)) ? Number(String(raw.price).replace(",", ".")) : NaN;
  if (!sku || sku.length > 160 || sku.includes(":") || !name || !Number.isFinite(priceRub) || priceRub <= 0 || !slugPattern.test(context?.placeSlug) || resolveYandexEatsRetailer(context) !== context.retailer) return null;
  const id = `yandex_eats:${context.placeSlug}:${sku}`;
  return {
    id, xmlId: id, retailer: context.retailer, catalogProvider: "yandex_eats",
    retailerPlaceSlug: context.placeSlug,
    ...(context.placeId ? { retailerPlaceId: String(context.placeId) } : {}),
    ...(context.placeName ? { retailerPlaceName: context.placeName } : {}),
    name, priceRub,
    ...(typeof raw.weight === "string" ? { weightLabel: raw.weight } : {}),
    ...(typeof raw.picture_url === "string" && /^https?:\/\//i.test(raw.picture_url) ? { imageUrl: raw.picture_url } : {}),
    productUrl: `https://eda.yandex.ru/retail/${encodeURIComponent(context.placeSlug)}`,
    availability: "unknown", sourceQuery: context.sourceQuery ?? "", isDemo: false,
    priceObservedAt: context.priceObservedAt ?? new Date().toISOString(),
  };
}

export function createYandexEatsRetailAdapter(options = {}) {
  const enabled = options.enabled === true && ["candidates_only", "validated"].includes(options.mode);
  // ponytail: exact goods contract is unproven; even a validated env flag cannot bypass this gate.
  const mode = enabled ? "candidates_only" : "disabled";
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.nowMs ?? Date.now;
  const logger = options.logger ?? console.info;
  const baseUrl = options.baseUrl ?? "https://eda.yandex.ru";
  const timeoutMs = positive(options.timeoutMs, 5000);
  const limit = positive(options.limit, 12);
  const concurrency = Math.min(3, positive(options.concurrency, 3));
  const maxRetailers = positive(options.maxRetailers, 4);
  const placeTtl = ttl(options.placeCacheTtlMs, 1800000);
  const searchTtl = ttl(options.searchCacheTtlMs, 60000);
  const placesCache = new Map();
  const searchCache = new Map();
  const inFlight = new Map();
  const queue = [];
  let active = 0;
  let blockedUntil = 0;
  let blockedError;
  let connected = false;
  let captchaBlocked = false;
  let retailerCount = 0;
  const metrics = { requests: 0, cacheHits: 0, staleHits: 0, timeouts: 0, captcha: 0, statuses: {}, latencyMs: [], retailers: {} };

  async function limited(work) {
    if (active >= concurrency) await new Promise(resolve => queue.push(resolve));
    else active++;
    try { return await work(); }
    finally { const next = queue.shift(); if (next) next(); else active--; }
  }

  async function request(path, location, body, retailer) {
    if (!enabled) throw new RetailerUnavailableError();
    coordinateKey(location);
    return limited(async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (now() < blockedUntil) throw blockedError;
        const url = new URL(path, baseUrl);
        url.searchParams.set("latitude", String(location.lat));
        url.searchParams.set("longitude", String(location.lon));
        if (body?.place_slug) url.searchParams.set("placeSlug", body.place_slug);
        const started = now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let status = 0;
        let errorType;
        let networkCode;
        let resultCount = 0;
        try {
          metrics.requests++;
          const response = await fetchImpl(url, { method: body ? "POST" : "GET", headers: { Accept: body ? "application/json" : "text/html", "Accept-Language": "ru", ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal, redirect: "error", credentials: "omit" });
          status = response.status;
          metrics.statuses[status] = (metrics.statuses[status] ?? 0) + 1;
          const text = await response.text();
          if (/smartcaptcha|showcaptcha|captcha-container|подтвердите.{0,30}(не робот|человек)/i.test(text)) throw new RetailerCaptchaError();
          if (status === 429) throw new RetailerRateLimitError(response.headers.get("retry-after"));
          if (status === 401 || status === 403) throw new RetailerAuthError();
          if (!response.ok) throw new RetailerUnavailableError(status);
          let value = text;
          if (body) {
            try { value = JSON.parse(text); } catch { throw new InvalidRetailerResponseError(); }
            if (!Array.isArray(value?.payload?.items)) throw new InvalidRetailerResponseError();
            resultCount = value.payload.items.length;
          }
          connected = true;
          captchaBlocked = false;
          return value;
        } catch (cause) {
          networkCode = cause?.cause?.message === "unexpected redirect" ? "UNEXPECTED_REDIRECT" : /^[A-Z0-9_]+$/.test(cause?.cause?.code ?? "") ? cause.cause.code : undefined;
          const error = cause instanceof RetailerError ? cause : controller.signal.aborted ? new RetailerTimeoutError() : new RetailerUnavailableError();
          errorType = error.name;
          connected = false;
          if (error instanceof RetailerTimeoutError) metrics.timeouts++;
          if (error instanceof RetailerCaptchaError) { captchaBlocked = true; metrics.captcha++; }
          if (error instanceof RetailerRateLimitError || error instanceof RetailerAuthError || error instanceof RetailerCaptchaError) {
            const seconds = Number(error.retryAfter);
            const retryAt = error.retryAfter && Number.isFinite(seconds) ? now() + seconds * 1000 : Date.parse(error.retryAfter);
            blockedUntil = Math.max(now() + 60000, Number.isFinite(retryAt) ? retryAt : 0);
            blockedError = error;
          }
          if (attempt === 0 && (error instanceof RetailerTimeoutError || error instanceof RetailerUnavailableError && [502, 503, 504].includes(error.status))) continue;
          throw error;
        } finally {
          clearTimeout(timer);
          const latency = Math.max(0, now() - started);
          metrics.latencyMs.push(latency);
          if (metrics.latencyMs.length > 1000) metrics.latencyMs.shift();
          if (retailer) {
            const stats = metrics.retailers[retailer] ??= { requests: 0, errors: 0, results: 0 };
            stats.requests++; stats.errors += Number(Boolean(errorType)); stats.results += resultCount;
          }
          logger("yandex_eats_request", { operation: path, retailer, status, latency, resultCount, errorType, networkCode });
        }
      }
    });
  }

  async function cached(key, cache, cacheTtl, load, stale) {
    const entry = cache.get(key);
    if (entry && now() - entry.at < cacheTtl) { metrics.cacheHits++; return structuredClone(entry.value); }
    if (inFlight.has(key)) return structuredClone(await inFlight.get(key));
    const pending = (async () => {
      try {
        const value = await load();
        // ponytail: bounded in-process caches; replace with shared cache only when multi-instance hit rate matters.
        if (cache.size >= 500) cache.delete(cache.keys().next().value);
        cache.set(key, { at: now(), value });
        return value;
      } catch (error) {
        if (entry) { metrics.staleHits++; return stale(entry.value); }
        throw error;
      } finally { inFlight.delete(key); }
    })();
    inFlight.set(key, pending);
    return structuredClone(await pending);
  }

  async function resolveRetailPlaces(location) {
    const key = `places:${coordinateKey(location)}`;
    return cached(key, placesCache, placeTtl, async () => {
      const html = await request("/retail", location);
      const places = new Map();
      for (const match of html.matchAll(/(?:href\s*=\s*["'][^"']*\/retail\/|data-place-slug\s*=\s*["'])([a-z0-9_-]+)/gi)) {
        const placeSlug = match[1];
        const retailer = resolveYandexEatsRetailer({ placeSlug });
        if (!retailer) { logger("yandex_eats_unknown_place", { placeSlug }); continue; }
        places.set(placeSlug, { retailer, placeSlug, placeName: retailers[retailer].title, url: `https://eda.yandex.ru/retail/${encodeURIComponent(placeSlug)}` });
      }
      retailerCount = new Set([...places.values()].map(p => p.retailer)).size;
      if (!places.size) { connected = false; throw new RetailPlaceNotFoundError(); }
      return [...places.values()];
    }, value => value);
  }

  async function searchProducts(query, context) {
    if (!slugPattern.test(context?.placeSlug) || resolveYandexEatsRetailer(context) !== context.retailer || typeof query?.query !== "string" || !query.query.trim() || query.query.length > 60) throw new InvalidRetailerResponseError();
    const key = `search:${coordinateKey(context)}:${context.placeSlug}:${query.query.trim().toLowerCase()}:${query.sort ?? "popularity"}`;
    return cached(key, searchCache, searchTtl, async () => {
      const payload = await request("/api/v1/menu/search", context, { place_slug: context.placeSlug, text: query.query.trim() }, context.retailer);
      const products = Array.from(new Map(payload.payload.items.map(raw => normalizeYandexEatsProduct(raw, { ...context, sourceQuery: query.query, priceObservedAt: new Date(now()).toISOString() })).filter(Boolean).map(p => [p.xmlId, p])).values());
      if (query.sort === "price_asc") products.sort((a, b) => a.priceRub - b.priceRub);
      if (query.sort === "price_desc") products.sort((a, b) => b.priceRub - a.priceRub);
      return products.slice(0, limit);
    }, products => products.map(product => ({ ...product, availability: "unknown" })));
  }

  async function searchRetailers(query, location, directProducts = []) {
    const places = await resolveRetailPlaces(location);
    const selected = Object.entries(retailers).filter(([id, definition]) => definition.enabled && definition.providerPriority.includes("yandex_eats") && new Set(directProducts.filter(p => p.retailer === id && p.catalogProvider !== "yandex_eats").map(p => p.xmlId)).size < 4)
      .sort(([, a], [, b]) => Number(a.providerPriority[0] !== "yandex_eats") - Number(b.providerPriority[0] !== "yandex_eats"))
      .flatMap(([id]) => places.find(p => p.retailer === id) ?? []).slice(0, maxRetailers);
    const results = await Promise.allSettled(selected.map(place => searchProducts(query, { ...location, ...place })));
    return results.flatMap(result => result.status === "fulfilled" ? result.value : []);
  }

  async function verifyItems() { throw new ProductRecheckUnsupportedError(); }
  function status() { return { enabled, mode, connected, captchaBlocked, retailerCount }; }
  return { resolveRetailPlaces, searchProducts, searchRetailers, verifyItems, status, metrics };
}

function coordinateKey(location) {
  if (!Number.isFinite(location?.lat) || Math.abs(location.lat) > 90 || !Number.isFinite(location?.lon) || Math.abs(location.lon) > 180) throw new InvalidRetailerResponseError();
  return `${location.lat.toFixed(5)},${location.lon.toFixed(5)}`;
}
function positive(value, fallback) { const number = Number(value); return Number.isFinite(number) && number >= 1 ? Math.floor(number) : fallback; }
function ttl(value, fallback) { return value !== undefined && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : fallback; }
