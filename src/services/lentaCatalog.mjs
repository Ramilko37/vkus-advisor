const DEFAULT_BASE_URL = "https://integration.api.lenta.com";
const DEFAULT_NOMINATIM_URL = "https://nominatim.openstreetmap.org";
const DEFAULT_CHANNEL = "lo";
const DEFAULT_LIMIT = 4;
const DEFAULT_CACHE_TTL_MS = 3 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 5_000;

export class RetailerTimeoutError extends Error {
  constructor(message = "Lenta request timeout") {
    super(message);
    this.name = "RetailerTimeoutError";
  }
}

export class RetailerUnavailableError extends Error {
  constructor(message = "Lenta API unavailable", status) {
    super(message);
    this.name = "RetailerUnavailableError";
    this.status = status;
  }
}

export class RetailerRateLimitError extends Error {
  constructor(message = "Lenta API rate limited", retryAfter) {
    super(message);
    this.name = "RetailerRateLimitError";
    this.status = 429;
    this.retryAfter = retryAfter;
  }
}

export class StoreNotFoundError extends Error {
  constructor(message = "Lenta store was not found") {
    super(message);
    this.name = "StoreNotFoundError";
  }
}

export class ProductNotFoundError extends Error {
  constructor(message = "Lenta product was not found") {
    super(message);
    this.name = "ProductNotFoundError";
  }
}

export class InvalidRetailerResponseError extends Error {
  constructor(message = "Invalid Lenta API response") {
    super(message);
    this.name = "InvalidRetailerResponseError";
  }
}

export function resolveLentaRetailBrand(value = "lo") {
  const normalized = String(value || "lo").toLocaleLowerCase("ru-RU").trim();
  if (["mntk", "monetka", "монетка"].includes(normalized)) return "mntk";
  if (["utk", "utkonos", "утконос"].includes(normalized)) return "utk";
  return "lo";
}

export function createLentaCatalogAdapter(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const baseUrl = stripSlash(options.baseUrl || DEFAULT_BASE_URL);
  const nominatimBaseUrl = stripSlash(options.nominatimBaseUrl || DEFAULT_NOMINATIM_URL);
  const retailBrand = resolveLentaRetailBrand(options.retailBrand);
  const channel = options.channel || (retailBrand === "utk" ? "utk" : DEFAULT_CHANNEL);
  const limit = Number(options.limit || DEFAULT_LIMIT);
  const cacheTtlMs = Number(options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS);
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const now = options.now || (() => new Date().toISOString());
  const nowMs = options.nowMs || (() => Date.now());
  const logger = options.logger || console.info;
  const productCache = options.productCache || new Map();
  const storeCache = options.storeCache || new Map();
  let currentStoreId = stringValue(options.storeId) || "";
  let candidateStores = currentStoreId ? [{ id: currentStoreId, name: stringValue(options.storeName), address: stringValue(options.storeAddress) }] : [];
  let candidateStoreIds = currentStoreId ? [currentStoreId] : [];

  async function ensureStore(address = "") {
    if (currentStoreId) return currentStoreId;
    const resolvedAddress = cleanText(stringValue(address || options.address));
    if (!resolvedAddress) return "";
    const cacheKey = `${retailBrand}:${normalizeCacheKey(resolvedAddress)}`;
    const cached = storeCache.get(cacheKey);
    if (cached) {
      currentStoreId = cached.id;
      candidateStoreIds = cached.ids || [cached.id];
      candidateStores = cached.stores || [{ id: cached.id }];
      return currentStoreId;
    }
    const coordinates = parseCoordinates(resolvedAddress) || await geocode(resolvedAddress);
    if (!coordinates) return "";
    const url = apiUrl(baseUrl, "/v1/stores/nearest/hub", {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      retailBrand,
    });
    const payload = await fetchJson(url, "resolveStore");
    const stores = extractLentaStores(payload);
    const store = stores[0];
    currentStoreId = store?.id || "";
    if (!currentStoreId) throw new StoreNotFoundError();
    candidateStores = stores;
    candidateStoreIds = stores.map((item) => item.id);
    if (currentStoreId) storeCache.set(cacheKey, { ...store, id: currentStoreId, ids: candidateStoreIds, stores: candidateStores });
    return currentStoreId;
  }

  async function geocode(address) {
    const url = apiUrl(nominatimBaseUrl, "/search", { format: "json", limit: "1", q: address });
    const payload = await requestJson(fetchImpl, url, { headers: { "User-Agent": "vkusvill-advisor/0.1" }, timeoutMs, retry: false });
    const first = Array.isArray(payload) ? payload[0] : null;
    const latitude = numberValue(first?.lat);
    const longitude = numberValue(first?.lon);
    return latitude && longitude ? { latitude, longitude } : null;
  }

  async function listStores(address = "") {
    await ensureStore(address);
    return candidateStores.slice(0, 4).map((store) => ({
      id: store.id,
      name: stringValue(store.name),
      address: stringValue(store.address),
      distanceMeters: firstNumber(store.distance),
    }));
  }

  async function searchProducts(query, address = "") {
    const storeId = await ensureStore(address);
    if (!storeId) return [];
    const storeIds = [storeId, ...candidateStoreIds.filter((id) => id !== storeId)].slice(0, 4);
    let lastProducts = [];
    for (const id of storeIds) {
      const cacheKey = `search:${retailBrand}:${channel}:${id}:${normalizeCacheKey(query.query)}:${query.sort || "popularity"}`;
      const products = await cachedWithStale(productCache, cacheKey, cacheTtlMs, nowMs, async () => {
        const payload = await fetchJson(catalogItemsUrl(id, { query: query.query, limit, offset: 0 }), "search", id);
        return withStore(sortProducts(normalizeLentaProducts(payload, query.query, now()).filter((product) => product.availability !== "unavailable"), query.sort).slice(0, limit), id);
      });
      if (products.length) {
        currentStoreId = id;
        return products;
      }
      lastProducts = products;
    }
    return lastProducts;
  }

  async function getProductDetails(productId, address = "") {
    const storeId = await ensureStore(address);
    if (!storeId) return {};
    const itemId = stripLentaPrefix(productId);
    const cacheKey = `details:${retailBrand}:${channel}:${storeId}:${itemId}`;
    const products = await cachedWithStale(productCache, cacheKey, cacheTtlMs, nowMs, async () => {
      const payload = await fetchJson(catalogItemUrl(storeId, itemId), "getOffers", storeId);
      const product = normalizeLentaProduct(payload?.data || payload, "details", now());
      return product ? withStore([product], storeId) : [];
    });
    return products[0] || {};
  }

  async function verifyCartItems(items, address = "") {
    const storeId = await ensureStore(address);
    if (!storeId) return [];
    const ids = items.map((item) => stripLentaPrefix(item.xmlId)).filter(Boolean);
    if (!ids.length) return [];
    const cacheKey = `cart:${retailBrand}:${channel}:${storeId}:${ids.join(",")}`;
    return cachedWithStale(productCache, cacheKey, 0, nowMs, async () => {
      const payload = await fetchJson(catalogItemsUrl(storeId, { ids, limit: ids.length, offset: 0 }), "getOffers", storeId);
      const products = withStore(normalizeLentaProducts(payload, "cart", now()), storeId);
      if (!Array.isArray(products)) throw new InvalidRetailerResponseError();
      return products;
    });
  }

  async function fetchJson(url, operation, storeId = "") {
    const startedAt = nowMs();
    try {
      const payload = await requestJson(fetchImpl, url, { timeoutMs, retry: true });
      const count = extractProductList(payload).length || (extractLentaStore(payload) ? 1 : 0);
      logLenta(logger, { operation, storeId, latency: nowMs() - startedAt, status: 200, resultCount: count });
      return payload;
    } catch (error) {
      logLenta(logger, { operation, storeId, latency: nowMs() - startedAt, status: error?.status || 0, resultCount: 0, errorType: error?.name || "Error" });
      throw error;
    }
  }

  function catalogItemsUrl(storeId, params) {
    return apiUrl(baseUrl, "/catalog/v1/items", {
      stores: storeId,
      channel,
      retailBrand,
      ...params,
    });
  }

  function catalogItemUrl(storeId, itemId) {
    return apiUrl(baseUrl, `/catalog/v1/items/${encodeURIComponent(itemId)}`, {
      stores: storeId,
      channel,
      retailBrand,
    });
  }

  function withStore(products, storeId) {
    const store = candidateStores.find((item) => item.id === storeId);
    return products.map((product) => ({
      ...product,
      storeId,
      storeName: stringValue(store?.name),
      storeAddress: stringValue(store?.address),
    }));
  }

  return {
    channel,
    retailBrand,
    ensureStore,
    listStores,
    get currentStoreId() { return currentStoreId; },
    hasStore: () => Boolean(currentStoreId),
    searchProducts,
    getProductDetails,
    verifyCartItems,
  };
}

export function normalizeLentaProduct(raw, sourceQuery, priceObservedAt) {
  const value = raw?.data || raw;
  const itemId = stringValue(value?.id ?? value?.itemId ?? value?.sku ?? value?.code ?? value?.xml_id);
  const name = stringValue(value?.name ?? value?.title ?? value?.product_name);
  const priceRub = firstNumber(
    value?.priceRub,
    value?.current_price,
    value?.price_rub,
    value?.price?.current,
    value?.price?.value,
    value?.price?.amount,
    value?.price,
    value?.cardPrice,
    value?.regularPrice,
    kopecksValue(value?.prices?.price),
    kopecksValue(value?.prices?.cost),
  );
  if (!itemId || !name || !priceRub || priceRub <= 0) return null;
  return {
    id: `lenta:${itemId}`,
    xmlId: `lenta:${itemId}`,
    retailer: "lenta",
    catalogProvider: "lenta_direct",
    name: cleanText(name),
    priceRub,
    oldPriceRub: firstNumber(value?.oldPriceRub, value?.old_price, value?.price?.old, value?.regularPrice, kopecksValue(value?.prices?.priceRegular), kopecksValue(value?.prices?.costRegular)),
    loyaltyPriceRub: firstNumber(value?.loyaltyPrice, value?.loyalty_price, value?.cardPrice, kopecksValue(value?.prices?.loyaltyPrice), kopecksValue(value?.prices?.cardPrice)),
    rating: firstNumber(value?.rating, value?.rating?.average),
    reviewsCount: firstNumber(value?.reviewsCount, value?.reviews_count, value?.rating?.count),
    weightLabel: stringValue(value?.weightLabel ?? value?.weight ?? value?.volume ?? value?.size),
    imageUrl: imageValue(value),
    productUrl: stringValue(value?.url ?? value?.productUrl ?? value?.link),
    description: cleanText(stringValue(value?.description)),
    composition: cleanText(stringValue(value?.composition ?? value?.ingredients)),
    calories: firstNumber(value?.calories),
    proteins: firstNumber(value?.proteins),
    fats: firstNumber(value?.fats),
    carbohydrates: firstNumber(value?.carbohydrates ?? value?.carbs),
    availability: availabilityValue(value),
    sourceQuery,
    isDemo: false,
    priceObservedAt,
  };
}

function normalizeLentaProducts(payload, sourceQuery, priceObservedAt) {
  return extractProductList(payload)
    .map((item) => normalizeLentaProduct(item, sourceQuery, priceObservedAt))
    .filter(Boolean);
}

async function cachedWithStale(cache, key, ttlMs, nowMs, loader) {
  const current = cache.get(key);
  if (current && nowMs() - current.createdAt < ttlMs) return current.value;
  try {
    const value = await loader();
    cache.set(key, { value, createdAt: nowMs() });
    return value;
  } catch (error) {
    if (current) return current.value;
    throw error;
  }
}

async function requestJson(fetchImpl, url, { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS, retry = true } = {}) {
  let attempt = 0;
  while (true) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetchImpl(url, { headers, signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
      if (response.status === 429) throw new RetailerRateLimitError(undefined, response.headers?.get?.("retry-after"));
      if ([502, 503, 504].includes(response.status)) throw new RetailerUnavailableError(undefined, response.status);
      if (!response.ok) throw new RetailerUnavailableError(`Lenta API request failed: ${response.status}`, response.status);
      return response.json();
    } catch (error) {
      const typed = error?.name === "AbortError" ? new RetailerTimeoutError() : error;
      if (!retry || attempt > 0 || !isRetryable(typed)) throw typed;
      attempt += 1;
    }
  }
}

function apiUrl(baseUrl, path, params) {
  const url = new URL(path, `${baseUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(key, String(item)));
    else if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url;
}

function extractLentaStore(payload) {
  return extractLentaStores(payload)[0] || null;
}

function extractLentaStores(payload) {
  const stores = payload?.hubs || payload?.data?.hubs || payload?.stores || payload?.data?.stores || payload?.data || payload;
  const sorted = Array.isArray(stores)
    ? [...stores].sort((a, b) => (numberValue(a?.distance) ?? Number.MAX_SAFE_INTEGER) - (numberValue(b?.distance) ?? Number.MAX_SAFE_INTEGER))
    : stores;
  return (Array.isArray(sorted) ? sorted : [sorted])
    .map((store) => {
      const id = stringValue(store?.aliasId ?? store?.id ?? store?.storeId ?? store?.store_id);
      return id ? { ...store, id } : null;
    })
    .filter(Boolean);
}

function extractProductList(value) {
  if (Array.isArray(value)) return value;
  for (const key of ["items", "products", "results", "data"]) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  if (Array.isArray(value?.data?.items)) return value.data.items;
  return [];
}

function sortProducts(products, sort) {
  if (sort === "price_asc") return [...products].sort((a, b) => a.priceRub - b.priceRub);
  if (sort === "price_desc") return [...products].sort((a, b) => b.priceRub - a.priceRub);
  if (sort === "rating") return [...products].sort((a, b) => (b.rating || 0) - (a.rating || 0));
  return products;
}

function availabilityValue(value) {
  if (value?.available === true || value?.isAvailable === true) return "available";
  if (value?.available === false || value?.isAvailable === false) return "unavailable";
  const stock = firstNumber(value?.stock, value?.quantity, value?.availableQuantity);
  if (stock !== undefined) return stock > 0 ? "available" : "unavailable";
  const status = String(value?.availability ?? value?.stockStatus ?? "").toLocaleLowerCase("ru-RU");
  if (/нет|out|unavailable|missing/.test(status)) return "unavailable";
  if (/есть|available|in_stock/.test(status)) return "available";
  return "unknown";
}

function isRetryable(error) {
  return error?.name === "RetailerTimeoutError" || [502, 503, 504].includes(error?.status);
}

function logLenta(logger, data) {
  logger("lenta_request", {
    retailer: "lenta",
    operation: data.operation,
    storeId: data.storeId || undefined,
    latency: Math.round(data.latency),
    status: data.status,
    resultCount: data.resultCount,
    errorType: data.errorType,
  });
}

function parseCoordinates(text) {
  const match = String(text).match(/(-?\d{1,2}(?:[.,]\d+)?)\s*[,;]\s*(-?\d{1,3}(?:[.,]\d+)?)/);
  if (!match) return null;
  const latitude = numberValue(match[1]);
  const longitude = numberValue(match[2]);
  return latitude && Math.abs(latitude) <= 90 && longitude && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
}

function imageValue(raw) {
  const direct = stringValue(raw?.image ?? raw?.imageUrl ?? raw?.image_url ?? raw?.picture ?? raw?.photo ?? raw?.thumbnail);
  if (direct) return direct;
  if (raw?.image?.url) return stringValue(raw.image.url);
  if (!Array.isArray(raw?.images)) return undefined;
  for (const item of raw.images) {
    const url = stringValue(item?.medium ?? item?.small ?? item?.large ?? item?.url);
    if (url) return url;
  }
  return undefined;
}

function stripLentaPrefix(value) {
  return String(value || "").replace(/^lenta:/, "");
}

function firstNumber(...values) {
  for (const value of values) {
    const direct = numberValue(value);
    if (direct !== undefined) return direct;
    if (value && typeof value === "object") {
      const nested = firstNumber(value.current, value.value, value.amount, value.price);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

function numberValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const match = value.replace(/\s/g, "").replace(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

function kopecksValue(value) {
  const number = numberValue(value);
  return number === undefined ? undefined : number / 100;
}

function stringValue(value) {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function cleanText(value) {
  return value?.replace(/&nbsp;/g, " ").replace(/<br\s*\/?>/gi, "\n").trim();
}

function normalizeCacheKey(value) {
  return String(value || "").toLocaleLowerCase("ru-RU").replace(/\s+/g, " ").trim();
}

function stripSlash(value) {
  return String(value).replace(/\/$/, "");
}
