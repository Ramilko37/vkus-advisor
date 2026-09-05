const DEFAULT_BASE_URL = "https://lavka.yandex.ru";
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_SEARCH_LIMIT = 12;
const DEFAULT_LOCATION_CACHE_TTL_MS = 30 * 60 * 1_000;
const DEFAULT_SEARCH_CACHE_TTL_MS = 60_000;
const DEFAULT_DETAILS_CACHE_TTL_MS = 3 * 60 * 1_000;
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const CSRF_RE = /"csrfToken"\s*:\s*"([^"]+)"/;

class RetailerError extends Error {
  constructor(message, status) {
    super(message);
    this.name = new.target.name;
    this.status = status;
  }
}

export class RetailerTimeoutError extends RetailerError {
  constructor() { super("Yandex Lavka request timed out"); }
}

export class RetailerUnavailableError extends RetailerError {
  constructor(status) { super("Yandex Lavka is temporarily unavailable", status); }
}

export class RetailerRateLimitError extends RetailerError {
  constructor(retryAfter) {
    super("Yandex Lavka rate limit exceeded", 429);
    this.retryAfter = retryAfter;
  }
}

export class RetailerAuthError extends RetailerError {
  constructor(status) { super("Yandex Lavka session is not authorized", status); }
}

export class ProductNotFoundError extends RetailerError {
  constructor() { super("Yandex Lavka product was not found", 404); }
}

export class InvalidRetailerResponseError extends RetailerError {
  constructor() { super("Invalid Yandex Lavka response"); }
}

export class AddressNotResolvedError extends RetailerError {
  constructor() { super("Yandex Lavka could not resolve the delivery address"); }
}

export function createYandexLavkaAdapter(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const session = parseSession(options.session);
  const timeoutMs = positiveNumber(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const limit = positiveNumber(options.limit, DEFAULT_SEARCH_LIMIT);
  const searchCacheTtlMs = nonNegativeNumber(options.cacheTtlMs, DEFAULT_SEARCH_CACHE_TTL_MS);
  const detailsCacheTtlMs = nonNegativeNumber(options.detailsCacheTtlMs, DEFAULT_DETAILS_CACHE_TTL_MS);
  const locationCacheTtlMs = nonNegativeNumber(options.locationCacheTtlMs, DEFAULT_LOCATION_CACHE_TTL_MS);
  const now = options.now || (() => new Date().toISOString());
  const nowMs = options.nowMs || (() => Date.now());
  const logger = options.logger || console.info;
  const locationCache = options.locationCache || new Map();
  const searchCache = options.searchCache || new Map();
  const detailsCache = options.detailsCache || new Map();
  const metrics = {
    searches: 0,
    searchSuccesses: 0,
    emptySearches: 0,
    validations: 0,
    validationSuccesses: 0,
    authErrors: 0,
    rateLimits: 0,
    upstream5xx: 0,
    cacheHits: 0,
    staleCacheHits: 0,
  };
  let csrfToken = "";
  let csrfPromise = null;

  function requestHeaders() {
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...session.headers,
      "X-Requested-With": "XMLHttpRequest",
      "X-Lavka-Web-Locale": String(session.context.locale || "ru-RU"),
      "X-Lavka-Web-City": String(session.context.webCity || "213"),
      "X-Captcha-Service": "lavka",
      "X-Captcha-Language": "ru",
      Origin: DEFAULT_BASE_URL,
      Referer: `${DEFAULT_BASE_URL}/`,
      Cookie: cookieHeader(session.cookies),
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    };
  }

  async function ensureCsrf(force = false) {
    if (force) csrfToken = "";
    if (csrfToken) return csrfToken;
    if (csrfPromise) return csrfPromise;
    csrfPromise = (async () => {
      assertConfiguredSession(session);
      const startedAt = nowMs();
      try {
        const response = await fetchWithTimeout(fetchImpl, `${baseUrl}/`, { method: "GET", headers: requestHeaders() }, timeoutMs);
        if (response.status === 401 || response.status === 403) {
          metrics.authErrors += 1;
          throw new RetailerAuthError(response.status);
        }
        if (!response.ok) throw statusError(response);
        const token = extractCsrfToken(await response.text());
        if (!token) throw new InvalidRetailerResponseError();
        csrfToken = token;
        logRequest(logger, "csrf", nowMs() - startedAt, response.status, 1);
        return token;
      } catch (error) {
        const typed = normalizeNetworkError(error);
        logRequest(logger, "csrf", nowMs() - startedAt, typed.status || 0, 0, typed.name);
        throw typed;
      } finally {
        csrfPromise = null;
      }
    })();
    return csrfPromise;
  }

  async function requestJson(path, body, operation) {
    await ensureCsrf();
    let retryUsed = false;
    let csrfRefreshed = false;
    while (true) {
      const startedAt = nowMs();
      try {
        const response = await fetchWithTimeout(fetchImpl, `${baseUrl}${path}`, {
          method: "POST",
          headers: requestHeaders(),
          body: JSON.stringify(body),
        }, timeoutMs);
        if (response.status === 401 || response.status === 403) {
          if (!csrfRefreshed) {
            csrfRefreshed = true;
            await ensureCsrf(true);
            continue;
          }
          metrics.authErrors += 1;
          throw new RetailerAuthError(response.status);
        }
        if (response.status === 429) {
          metrics.rateLimits += 1;
          throw new RetailerRateLimitError(response.headers?.get?.("retry-after"));
        }
        if (RETRYABLE_STATUSES.has(response.status)) {
          metrics.upstream5xx += 1;
          throw new RetailerUnavailableError(response.status);
        }
        if (response.status === 404 && operation === "details") throw new ProductNotFoundError();
        if (!response.ok) throw new RetailerUnavailableError(response.status);
        let payload;
        try {
          payload = await response.json();
        } catch {
          throw new InvalidRetailerResponseError();
        }
        logRequest(logger, operation, nowMs() - startedAt, response.status, resultCount(payload));
        return payload;
      } catch (error) {
        const typed = normalizeNetworkError(error);
        logRequest(logger, operation, nowMs() - startedAt, typed.status || 0, 0, typed.name);
        if (!retryUsed && isRetryable(typed)) {
          retryUsed = true;
          continue;
        }
        throw typed;
      }
    }
  }

  async function resolveLocation(address) {
    const normalizedAddress = normalizeCacheKey(address);
    if (!normalizedAddress) throw new AddressNotResolvedError();
    const cached = locationCache.get(normalizedAddress);
    if (cached && nowMs() - cached.createdAt < locationCacheTtlMs) {
      metrics.cacheHits += 1;
      return cached.value;
    }
    const suggested = await requestJson("/api/v1/providers/geo/v1/suggest", {
      query: cleanText(address),
      action: "user_input",
      lang: "ru",
    }, "resolveAddress");
    const suggestions = extractArray(suggested);
    const match = suggestions.find((item) => Array.isArray(item?.position) && item.position.length >= 2);
    const lon = numberValue(match?.position?.[0]);
    const lat = numberValue(match?.position?.[1]);
    if (!validCoordinates(lat, lon)) throw new AddressNotResolvedError();
    const geocoded = await requestJson("/api/v1/providers/geo/v1/geocode", {
      point: { lon, lat },
      lang: "ru",
      suppressError: true,
      action: "pin_drop",
    }, "resolveAddress");
    const resolved = geocoded?.data || geocoded || {};
    const location = {
      lon: numberValue(resolved.lon) ?? lon,
      lat: numberValue(resolved.lat) ?? lat,
    };
    if (!validCoordinates(location.lat, location.lon)) throw new AddressNotResolvedError();
    locationCache.set(normalizedAddress, { value: location, createdAt: nowMs() });
    return location;
  }

  function baseBody(location) {
    return {
      depotType: session.context.depotType || "regular",
      currencySign: "₽",
      position: { location: [location.lon, location.lat] },
    };
  }

  async function searchProducts(query, address) {
    metrics.searches += 1;
    const location = await resolveLocation(address);
    const cacheKey = `${normalizeCacheKey(address)}:${location.lon},${location.lat}:${normalizeCacheKey(query?.query)}:${query?.sort || "popularity"}`;
    const cached = searchCache.get(cacheKey);
    if (cached && nowMs() - cached.createdAt < searchCacheTtlMs) {
      metrics.cacheHits += 1;
      logRequest(logger, "search", 0, 200, cached.value.length, undefined, { cacheHit: true });
      return cached.value;
    }
    try {
      const observedAt = now();
      const payload = await requestJson("/api/v1/providers/search/v3/lavka", {
        ...baseBody(location),
        text: cleanText(query?.query),
        productsLimit: limit,
        subcategoriesLimit: 0,
        useRetail: true,
        source: "manual_input",
      }, "search");
      if (!Array.isArray(payload?.cacheProducts)) throw new InvalidRetailerResponseError();
      const products = sortProducts(payload.cacheProducts
        .map((raw) => normalizeYandexLavkaProduct(raw, query.query, observedAt))
        .filter((product) => product && product.availability !== "unavailable"), query.sort)
        .slice(0, limit);
      searchCache.set(cacheKey, { value: products, createdAt: nowMs() });
      metrics.searchSuccesses += 1;
      if (!products.length) metrics.emptySearches += 1;
      return products;
    } catch (error) {
      if (cached && isRetryable(error)) {
        metrics.staleCacheHits += 1;
        logRequest(logger, "search", 0, error.status || 0, cached.value.length, error.name, { staleCacheHit: true });
        return cached.value.map((product) => ({ ...product, availability: "unknown" }));
      }
      throw error;
    }
  }

  async function loadProductDetails(productId, address, useCache, resolvedLocation) {
    const slug = stripLavkaPrefix(productId);
    if (!slug) throw new ProductNotFoundError();
    const location = resolvedLocation || await resolveLocation(address);
    const cacheKey = `${normalizeCacheKey(address)}:${location.lon},${location.lat}:${slug}`;
    const cached = detailsCache.get(cacheKey);
    if (useCache && cached && nowMs() - cached.createdAt < detailsCacheTtlMs) {
      metrics.cacheHits += 1;
      logRequest(logger, "details", 0, 200, 1, undefined, { cacheHit: true });
      return cached.value;
    }
    const payload = await requestJson("/api/v1/providers/v1/product", {
      ...baseBody(location),
      productId: slug,
      needCatalogPaths: true,
      isEcomboReward: false,
      rewardPriceTemplate: "",
      enableUnavailable: true,
    }, "details");
    const raw = payload?.product;
    if (!raw || typeof raw !== "object") throw new ProductNotFoundError();
    const product = normalizeYandexLavkaProduct({ ...raw, deepLink: raw.deepLink || slug }, "details", now());
    if (!product) throw new InvalidRetailerResponseError();
    const details = {
      ...product,
      ...(cleanText(raw.description || raw.longTitle) ? { description: cleanText(raw.description || raw.longTitle) } : {}),
    };
    if (useCache) detailsCache.set(cacheKey, { value: details, createdAt: nowMs() });
    return details;
  }

  function getProductDetails(productId, address) {
    return loadProductDetails(productId, address, true);
  }

  async function verifyCartItems(items, address) {
    metrics.validations += 1;
    const location = await resolveLocation(address);
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
      while (next < items.length) {
        const index = next++;
        const item = items[index];
        if (!item?.id) continue;
        try {
          const fresh = await loadProductDetails(item.id, address, false, location);
          results[index] = { ...fresh, id: item.id, xmlId: item.xmlId };
        } catch {
          // Missing refreshes are omitted so orchestration can warn without declaring them unavailable.
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, items.length) }, worker));
    const products = results.filter(Boolean);
    metrics.validationSuccesses += products.length === items.length ? 1 : 0;
    logRequest(logger, "validate", 0, 200, products.length);
    return products;
  }

  return { resolveLocation, searchProducts, getProductDetails, verifyCartItems, metrics };
}

export function normalizeYandexLavkaProduct(raw, sourceQuery, priceObservedAt) {
  const sku = stringValue(raw?.id);
  const deepLink = stringValue(raw?.deepLink);
  const name = cleanText(stringValue(raw?.title ?? raw?.name));
  const priceRub = firstNumber(raw?.currentPrice, raw?.price, raw?.pricePerItem);
  if (!sku || !deepLink || !name || priceRub === undefined || priceRub <= 0) return null;
  const availability = firstDefined(raw?.available, raw?.in_stock, raw?.inStock);
  return {
    id: `lavka:${deepLink}`,
    xmlId: `lavka:${sku}`,
    retailer: "lavka",
    catalogProvider: "lavka_direct",
    name,
    priceRub,
    ...(firstNumber(raw?.oldPrice) !== undefined ? { oldPriceRub: firstNumber(raw.oldPrice) } : {}),
    ...(stringValue(raw?.amount ?? raw?.quantity ?? raw?.weight) ? { weightLabel: stringValue(raw.amount ?? raw.quantity ?? raw.weight) } : {}),
    availability: availability === true ? "available" : availability === false ? "unavailable" : "unknown",
    sourceQuery,
    isDemo: false,
    priceObservedAt,
  };
}

export function extractCsrfToken(html) {
  return CSRF_RE.exec(String(html || ""))?.[1] || "";
}

function parseSession(value) {
  if (typeof value === "string") {
    try { return parseSession(JSON.parse(value)); } catch { return { cookies: {}, headers: {}, context: {} }; }
  }
  return {
    cookies: value?.cookies && typeof value.cookies === "object" ? value.cookies : {},
    headers: value?.headers && typeof value.headers === "object" ? value.headers : {},
    context: value?.context && typeof value.context === "object" ? value.context : {},
  };
}

function assertConfiguredSession(session) {
  if (!(session.cookies.Session_id || session.cookies.Session_id2) || !session.cookies.yandexuid) throw new RetailerAuthError();
}

function cookieHeader(cookies) {
  return Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join("; ");
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw new RetailerTimeoutError();
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeNetworkError(error) {
  if (error instanceof RetailerError) return error;
  if (error?.name === "AbortError") return new RetailerTimeoutError();
  return new RetailerUnavailableError();
}

function statusError(response) {
  if (response.status === 429) return new RetailerRateLimitError(response.headers?.get?.("retry-after"));
  return new RetailerUnavailableError(response.status);
}

function isRetryable(error) {
  return error instanceof RetailerTimeoutError || (error instanceof RetailerUnavailableError && (!error.status || RETRYABLE_STATUSES.has(error.status)));
}

function extractArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  return Object.values(value).find(Array.isArray) || [];
}

function sortProducts(products, sort) {
  if (sort === "price_asc") return [...products].sort((a, b) => a.priceRub - b.priceRub);
  if (sort === "price_desc") return [...products].sort((a, b) => b.priceRub - a.priceRub);
  return products;
}

function resultCount(payload) {
  if (Array.isArray(payload?.cacheProducts)) return payload.cacheProducts.length;
  if (payload?.product) return 1;
  if (Array.isArray(payload)) return payload.length;
  return payload && typeof payload === "object" ? 1 : 0;
}

function logRequest(logger, operation, latency, status, count, errorType, extra = {}) {
  logger("lavka_request", {
    retailer: "lavka",
    operation,
    latency: Math.round(latency),
    status,
    resultCount: count,
    errorType,
    ...extra,
  });
}

function validCoordinates(lat, lon) {
  return Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180;
}

function stripLavkaPrefix(value) {
  return String(value || "").replace(/^lavka:/, "").trim();
}

function normalizeCacheKey(value) {
  return cleanText(String(value || "")).toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
}

function cleanText(value) {
  return String(value || "").replace(/&nbsp;/g, " ").replace(/<br\s*\/?>/gi, "\n").trim();
}

function stringValue(value) {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function numberValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/[\s\u00a0]/g, "").replace(",", ".");
  return /^-?\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : undefined;
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = numberValue(value);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonNegativeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}
