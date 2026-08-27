import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
loadDotEnv();

const distDir = resolve(__dirname, "dist");
const port = Number(process.env.PORT || 5174);
const openRouterUrl = process.env.OPENROUTER_API_URL || "https://openrouter.ai/api/v1/chat/completions";
const defaultStructuredModel = "nvidia/nemotron-3-super-120b-a12b:free";
const legacyModel = process.env.OPENROUTER_MODEL;
const intentModel = process.env.OPENROUTER_INTENT_MODEL || legacyModel || defaultStructuredModel;
const basketModel = process.env.OPENROUTER_BASKET_MODEL || legacyModel || defaultStructuredModel;
const intentFallbackModel = process.env.OPENROUTER_INTENT_FALLBACK_MODEL || process.env.OPENROUTER_FALLBACK_MODEL || "dots-studio/dots-3-note-preview:free";
const basketFallbackModel = process.env.OPENROUTER_BASKET_FALLBACK_MODEL || process.env.OPENROUTER_FALLBACK_MODEL || "dots-studio/dots-3-note-preview:free";
const openRouterReferer = process.env.OPENROUTER_HTTP_REFERER || `http://127.0.0.1:${port}`;
const openRouterTitle = process.env.OPENROUTER_APP_TITLE || "Basket Task Prototype";
const mcpUrls = [
  process.env.VKUSVILL_MCP_URL || "https://mcp.vkusvill.ru/mcp",
  "https://mcp001.vkusvill.ru/mcp",
];
const maxSearchResultsPerQuery = Number(process.env.MAX_SEARCH_RESULTS_PER_QUERY || 4);
const searchCacheTtlMs = 3 * 60 * 1000;
const detailsCacheTtlMs = 30 * 60 * 1000;

let mcpClient = null;
let catalogMode = "demo";
const searchCache = new Map();
const detailsCache = new Map();
const inFlightSearches = new Map();
const inFlightDetails = new Map();

export async function handleRequest(req, res) {
  try {
    if (!req.url) return send(res, 404, { error: "Not found" });
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/health") return send(res, 200, {
      openRouterConfigured: Boolean(process.env.OPENROUTER_API_KEY),
      openRouterApiUrl: openRouterUrl,
      intentModel: effectiveModel(intentModel),
      basketModel: effectiveModel(basketModel),
      openRouterReferer,
      openRouterTitle,
      catalogMode,
    });
    if (url.pathname === "/api/openrouter" && req.method === "POST") return await handleOpenRouter(req, res);
    if (url.pathname === "/api/catalog/status") return await handleCatalogStatus(res);
    if (url.pathname === "/api/catalog/search" && req.method === "POST") return await handleCatalogSearch(req, res);
    if (url.pathname === "/api/catalog/details") return await handleCatalogDetails(url, res);
    if (url.pathname === "/api/catalog/cart" && req.method === "POST") return await handleCart(req, res);
    return await serveStatic(url, res);
  } catch (error) {
    send(res, error?.status || 500, { error: error instanceof Error ? error.message : "Server error" });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createServer(handleRequest).listen(port, "127.0.0.1", () => {
    console.log(`Server ready: http://127.0.0.1:${port}`);
  });
}

async function handleOpenRouter(req, res) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return send(res, 401, { error: "OPENROUTER_API_KEY is missing" });
  const body = await readJson(req);
  const result = await openRouterRequest(apiKey, body);
  return send(res, 200, result);
}

export async function openRouterStructuredRequest(apiKey, body, options = {}) {
  const baseConfig = generationConfig(body.stage);
  const config = {
    ...baseConfig,
    model: options.model ?? baseConfig.model,
    fallbackModel: options.fallbackModel === undefined ? baseConfig.fallbackModel : options.fallbackModel,
    temperature: options.temperature ?? baseConfig.temperature,
    maxTokens: options.maxTokens ?? body.maxTokens ?? baseConfig.maxTokens,
  };
  const primaryModel = options.resolveAlias === false ? config.model : effectiveModel(config.model);
  const fallback = options.resolveAlias === false ? config.fallbackModel : effectiveModel(config.fallbackModel);
  const models = [primaryModel, fallback || primaryModel].filter((model, index, all) => model && all.indexOf(model) === index).slice(0, 2);
  const formats = options.formats || ["json_schema", "json_object"];
  let lastError = null;
  let attempt = 0;
  for (const model of models) {
    for (const format of formats) {
      try {
        const result = await openRouterFetch(apiKey, body, format, model, config, attempt);
        return {
          ...result,
          retryCount: attempt,
          fallbackModelUsed: model !== primaryModel,
        };
      } catch (error) {
        lastError = error;
        if (!options.silent) console.warn("openrouter_attempt_failed", {
          stage: config.stage,
          model,
          format,
          status: error?.status,
          openRouterStatus: error?.openRouterStatus,
          message: String(error?.message || error).slice(0, 240),
        });
        attempt += 1;
        if (!isRetryableOpenRouterError(error)) throw error;
      }
    }
  }
  throw lastError;
}

async function openRouterRequest(apiKey, body) {
  return openRouterStructuredRequest(apiKey, body);
}

async function openRouterFetch(apiKey, body, format, model, config, retryIndex) {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  let response;
  try {
    response = await fetch(openRouterUrl, {
      method: "POST",
      signal: controller.signal,
      headers: openRouterHeaders(apiKey),
      body: JSON.stringify(openRouterBody(body, format, model, config, retryIndex)),
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("OpenRouter request timeout");
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text();
    const status = response.status === 429 ? 429 : response.status === 401 ? 401 : 502;
    const error = new Error(text || `OpenRouter ${response.status}`);
    error.status = status;
    error.openRouterStatus = response.status;
    throw error;
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    const error = new Error("Invalid OpenRouter response JSON");
    error.status = 502;
    error.openRouterStatus = 502;
    throw error;
  }
  const content = payload.choices?.[0]?.message?.content || "";
  const finishReason = payload.choices?.[0]?.finish_reason;
  if (finishReason === "content_filter") {
    const error = new Error("OpenRouter content filter");
    error.status = 422;
    throw error;
  }
  const parsed = extractJsonFromText(content);
  if (!parsed.ok) {
    const error = new Error("Invalid OpenRouter JSON");
    error.status = finishReason === "length" ? 504 : 502;
    error.content = content;
    error.finishReason = finishReason;
    error.openRouterStatus = error.status;
    throw error;
  }
  return {
    data: parsed.value,
    model: payload.model || model,
    finishReason,
    durationMs: Math.round(performance.now() - startedAt),
    usage: payload.usage ? {
      promptTokens: payload.usage.prompt_tokens,
      completionTokens: payload.usage.completion_tokens,
      totalTokens: payload.usage.total_tokens,
      reasoningTokens: payload.usage.completion_tokens_details?.reasoning_tokens,
      cachedTokens: payload.usage.prompt_tokens_details?.cached_tokens,
    } : undefined,
    responseFormat: format,
    repairRequired: parsed.repairRequired,
  };
}

function openRouterHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": openRouterReferer,
    "X-OpenRouter-Title": openRouterTitle,
  };
}

function openRouterBody(body, format, model, config, retryIndex) {
  return {
    model,
    messages: [
      { role: "system", content: String(body.systemPrompt || "") },
      { role: "user", content: openRouterUserContent(body) },
    ],
    temperature: config.temperature,
    max_tokens: retryIndex ? Math.min(Math.ceil(config.maxTokens * 1.25), config.stage === "basket" ? 2400 : 900) : config.maxTokens,
    stream: false,
    reasoning: { effort: "none" },
    response_format: format === "json_schema"
      ? { type: "json_schema", json_schema: { name: "response", strict: true, schema: body.jsonSchema } }
      : { type: "json_object" },
    plugins: [{ id: "response-healing" }],
    provider: { require_parameters: true, sort: config.providerSort },
    usage: { include: true },
    session_id: body.sessionId,
  };
}

function openRouterUserContent(body) {
  const payload = JSON.stringify(body.userPayload ?? {});
  return body.jsonSchema ? `${payload}\n\nJSON Schema:\n${JSON.stringify(body.jsonSchema)}` : payload;
}

function isRetryableOpenRouterError(error) {
  const text = String(error?.message || error);
  return error?.openRouterStatus >= 500
    || /Provider returned error|unavailable|real-time inference|temporarily unavailable|Invalid OpenRouter JSON|reasoning|response_format|json_schema|unsupported|parameters/i.test(text);
}

function generationConfig(stage) {
  const isBasket = stage === "basket";
  return {
    stage: isBasket ? "basket" : "intent",
    model: isBasket ? basketModel : intentModel,
    fallbackModel: isBasket ? basketFallbackModel : intentFallbackModel,
    temperature: isBasket ? 0.1 : 0,
    maxTokens: Number(isBasket ? process.env.OPENROUTER_BASKET_MAX_TOKENS || 1800 : process.env.OPENROUTER_INTENT_MAX_TOKENS || 600),
    timeoutMs: Number(isBasket ? process.env.OPENROUTER_BASKET_TIMEOUT_MS || 75_000 : process.env.OPENROUTER_INTENT_TIMEOUT_MS || 45_000),
    providerSort: isBasket ? "throughput" : "latency",
  };
}

function effectiveModel(model) {
  return model === "openrouter/free" ? defaultStructuredModel : model;
}

async function handleCatalogStatus(res) {
  await ensureMcp();
  send(res, 200, { mode: catalogMode });
}

async function handleCatalogSearch(req, res) {
  const query = await readJson(req);
  await ensureMcp();
  if (catalogMode === "live" && mcpClient) {
    try {
      const cacheKey = `${normalizeCacheKey(query.query)}:${query.sort || "popularity"}:1`;
      const products = await cached(cacheKey, searchCache, inFlightSearches, searchCacheTtlMs, async () => {
        const payload = await callMcp("vkusvill_products_search", { q: query.query, page: 1, sort: query.sort });
        return extractProductList(parseMcpResponse(payload))
          .map((item) => normalizeProduct(item, query.query, false))
          .filter(Boolean)
          .slice(0, maxSearchResultsPerQuery);
      });
      return send(res, 200, { mode: "live", products });
    } catch {
      catalogMode = "demo";
    }
  }
  send(res, 200, { mode: "demo", products: searchDemo(query).slice(0, 5) });
}

async function handleCatalogDetails(url, res) {
  const id = url.searchParams.get("id") || "";
  await ensureMcp();
  if (catalogMode === "live" && mcpClient && !id.startsWith("demo-")) {
    try {
      return send(res, 200, await cached(id, detailsCache, inFlightDetails, detailsCacheTtlMs, async () => {
        const payload = await callMcp("vkusvill_product_details", { id: Number(id) });
        return normalizeDetails(parseMcpResponse(payload));
      }));
    } catch {
      catalogMode = "demo";
    }
  }
  send(res, 200, demoProducts.find((product) => product.id === id || product.xmlId === id) || {});
}

async function handleCart(req, res) {
  const body = await readJson(req);
  await ensureMcp();
  if (catalogMode !== "live" || !mcpClient) return send(res, 409, { error: "Demo mode cannot create cart links" });
  const products = (body.items || []).slice(0, 20).map((item) => ({ xml_id: Number(item.xmlId), q: item.quantity }));
  const payload = await callMcp("vkusvill_cart_link_create", { products });
  const url = extractCartUrl(parseMcpResponse(payload));
  if (!url) return send(res, 502, { error: "Invalid cart URL" });
  send(res, 200, { url });
}

async function ensureMcp() {
  if (mcpClient || catalogMode === "live") return;
  for (const endpoint of mcpUrls) {
    try {
      const client = new Client({ name: "basket-task-server", version: "0.1.0" });
      const transport = new StreamableHTTPClientTransport(new URL(endpoint));
      await withTimeout(client.connect(transport), 10_000);
      mcpClient = client;
      catalogMode = "live";
      return;
    } catch {
      mcpClient = null;
      catalogMode = "demo";
    }
  }
}

function callMcp(name, args) {
  return withTimeout(mcpClient.callTool({ name, arguments: args }), 20_000);
}

async function serveStatic(url, res) {
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const file = resolve(join(distDir, pathname));
  if (!file.startsWith(distDir) || !existsSync(file)) return send(res, 404, "Not found", "text/plain");
  const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" }[extname(file)] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  res.end(await readFile(file));
}

function readJson(req) {
  return new Promise((resolveJson, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      try {
        resolveJson(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

async function cached(key, cache, inFlight, ttlMs, loader) {
  const cachedValue = cache.get(key);
  if (cachedValue && Date.now() - cachedValue.createdAt < ttlMs) return cachedValue.value;
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = loader().then((value) => {
    cache.set(key, { value, createdAt: Date.now() });
    return value;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

function normalizeCacheKey(value) {
  return String(value || "").toLocaleLowerCase("ru-RU").replace(/\s+/g, " ").trim();
}

function loadDotEnv() {
  const file = join(__dirname, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function extractJsonFromText(text) {
  try {
    return { ok: true, value: JSON.parse(text), repairRequired: false };
  } catch {
    // Try fenced or embedded JSON below.
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return { ok: true, value: JSON.parse(fenced[1].trim()), repairRequired: true };
    } catch {
      // Try balanced embedded JSON below.
    }
  }
  const start = text.search(/\{|\[/);
  if (start < 0) return null;
  const opener = text[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') inString = !inString;
    if (inString) continue;
    if (char === opener) depth += 1;
    if (char === closer) depth -= 1;
    if (depth === 0) {
      try {
        return { ok: true, value: JSON.parse(text.slice(start, i + 1)), repairRequired: true };
      } catch {
        return { ok: false };
      }
    }
  }
  return { ok: false };
}

function parseMcpResponse(value) {
  if (typeof value === "string") {
    const parsed = extractJsonFromText(value);
    return parsed.ok ? parsed.value : value;
  }
  const content = value?.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (typeof part.text === "string") {
        const parsed = extractJsonFromText(part.text);
        return parsed.ok ? parsed.value : part.text;
      }
    }
  }
  return value;
}

function extractProductList(value) {
  if (Array.isArray(value)) return value;
  for (const key of ["items", "products", "results", "data"]) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  if (Array.isArray(value?.data?.items)) return value.data.items;
  return [];
}

function normalizeProduct(raw, sourceQuery, isDemo) {
  const xmlId = stringValue(raw?.xml_id ?? raw?.xmlId ?? raw?.id);
  const name = stringValue(raw?.name ?? raw?.title ?? raw?.product_name);
  const priceRub = numberValue(raw?.priceRub ?? raw?.current_price ?? raw?.price_rub) || numberValue(raw?.price?.current) || numberValue(raw?.price);
  if (!xmlId || !name || !priceRub || priceRub <= 0) return null;
  return {
    id: stringValue(raw?.id) || xmlId,
    xmlId,
    name: cleanText(name),
    priceRub,
    oldPriceRub: numberValue(raw?.oldPriceRub ?? raw?.old_price) || numberValue(raw?.price?.old),
    rating: numberValue(raw?.rating) || numberValue(raw?.rating?.average),
    reviewsCount: numberValue(raw?.reviewsCount ?? raw?.reviews_count) || numberValue(raw?.rating?.count),
    weightLabel: stringValue(raw?.weightLabel ?? raw?.weight ?? raw?.volume),
    imageUrl: stringValue(raw?.image ?? raw?.imageUrl ?? raw?.picture),
    productUrl: stringValue(raw?.url ?? raw?.productUrl ?? raw?.link),
    description: cleanText(stringValue(raw?.description)),
    composition: cleanText(stringValue(raw?.composition ?? raw?.ingredients)) || propertyValue(raw, "состав"),
    calories: numberValue(raw?.calories),
    proteins: numberValue(raw?.proteins),
    fats: numberValue(raw?.fats),
    carbohydrates: numberValue(raw?.carbohydrates),
    sourceQuery,
    isDemo,
  };
}

function normalizeDetails(raw) {
  return normalizeProduct(raw, "details", false) || {
    description: stringValue(raw?.description),
    composition: stringValue(raw?.composition ?? raw?.ingredients),
    calories: numberValue(raw?.calories),
    proteins: numberValue(raw?.proteins),
    fats: numberValue(raw?.fats),
    carbohydrates: numberValue(raw?.carbohydrates),
  };
}

function extractCartUrl(raw) {
  const text = typeof raw === "string" ? raw : JSON.stringify(raw);
  const found = raw?.url || text.match(/https:\/\/[^\s"'<>]+/)?.[0];
  if (!found) return null;
  try {
    const url = new URL(found);
    return url.protocol === "https:" && url.hostname.endsWith("vkusvill.ru") ? url.toString() : null;
  } catch {
    return null;
  }
}

function stringValue(value) {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function numberValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const match = value.replace(/\s/g, "").replace(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

function cleanText(value) {
  return value?.replace(/&nbsp;/g, " ").replace(/<br\s*\/?>/gi, "\n").trim();
}

function propertyValue(raw, name) {
  const found = Array.isArray(raw?.properties)
    ? raw.properties.find((item) => String(item?.name || "").toLocaleLowerCase("ru-RU").includes(name))
    : null;
  return cleanText(stringValue(found?.value));
}

function searchDemo(query) {
  const normalized = String(query.query || "").toLocaleLowerCase("ru-RU");
  const scored = demoProducts
    .map((product) => ({ product, score: scoreProduct(product, normalized) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => {
      if (query.sort === "price_asc") return a.product.priceRub - b.product.priceRub;
      if (query.sort === "price_desc") return b.product.priceRub - a.product.priceRub;
      if (query.sort === "rating") return (b.product.rating || 0) - (a.product.rating || 0);
      return b.score - a.score;
    });
  return (scored.length ? scored : demoProducts.map((product) => ({ product, score: 1 })))
    .slice(0, 5)
    .map(({ product }) => ({ ...product, sourceQuery: query.query }));
}

function scoreProduct(product, query) {
  const text = `${product.name} ${product.description || ""} ${product.composition || ""} ${product.sourceQuery}`.toLocaleLowerCase("ru-RU");
  return query.split(/\s+/).reduce((score, token) => score + (text.includes(token) ? 1 : 0), 0);
}

const demo = (xmlId, name, priceRub, sourceQuery, extra = {}) => ({ id: xmlId, xmlId, name, priceRub, sourceQuery, isDemo: true, ...extra });
const demoProducts = [
  demo("demo-101", "Овсяные хлопья 500 г", 89, "завтрак", { rating: 4.8, weightLabel: "500 г", composition: "овсяные хлопья" }),
  demo("demo-102", "Творог 5%", 135, "творог", { rating: 4.7, weightLabel: "200 г", composition: "молоко, закваска" }),
  demo("demo-103", "Йогурт натуральный", 78, "йогурт", { rating: 4.6, weightLabel: "170 г", composition: "молоко, закваска" }),
  demo("demo-104", "Яйца куриные С1", 129, "яйца", { rating: 4.8, weightLabel: "10 шт" }),
  demo("demo-105", "Сырники творожные", 219, "готовый завтрак", { rating: 4.5, weightLabel: "300 г", composition: "творог, мука, яйцо" }),
  demo("demo-106", "Гречка ядрица", 112, "гарнир", { rating: 4.9, weightLabel: "900 г", composition: "гречневая крупа" }),
  demo("demo-107", "Рис басмати", 168, "гарнир", { rating: 4.7, weightLabel: "500 г", composition: "рис" }),
  demo("demo-108", "Макароны из твёрдых сортов", 96, "гарнир", { rating: 4.6, weightLabel: "450 г", composition: "пшеница твёрдых сортов" }),
  demo("demo-109", "Киноа с овощами замороженная", 249, "гарнир овощи", { rating: 4.4, weightLabel: "400 г", composition: "киноа, перец, морковь" }),
  demo("demo-110", "Филе куриное охлаждённое", 369, "белок", { rating: 4.7, weightLabel: "600 г", composition: "куриное филе" }),
  demo("demo-111", "Фарш индейки", 329, "белок", { rating: 4.6, weightLabel: "500 г", composition: "мясо индейки" }),
  demo("demo-112", "Котлеты куриные охлаждённые", 285, "готовая еда", { rating: 4.5, weightLabel: "360 г", composition: "курица, лук, сухари" }),
  demo("demo-113", "Лосось слабосолёный", 459, "рыба", { rating: 4.5, weightLabel: "150 г", composition: "лосось, соль" }),
  demo("demo-114", "Филе трески замороженное", 399, "рыба", { rating: 4.4, weightLabel: "400 г", composition: "треска" }),
  demo("demo-115", "Нут консервированный", 119, "белок", { rating: 4.6, weightLabel: "400 г", composition: "нут, вода, соль" }),
  demo("demo-116", "Фасоль красная", 105, "белок", { rating: 4.5, weightLabel: "400 г", composition: "фасоль, вода, соль" }),
  demo("demo-117", "Огурцы короткоплодные", 149, "овощи", { rating: 4.7, weightLabel: "450 г" }),
  demo("demo-118", "Томаты черри", 189, "овощи", { rating: 4.6, weightLabel: "250 г" }),
  demo("demo-119", "Салатная смесь", 159, "овощи", { rating: 4.5, weightLabel: "125 г", composition: "листья салата" }),
  demo("demo-120", "Овощи для жарки замороженные", 175, "овощи", { rating: 4.4, weightLabel: "400 г", composition: "брокколи, морковь, фасоль" }),
  demo("demo-121", "Суп куриный готовый", 239, "готовая еда", { rating: 4.3, weightLabel: "300 г", composition: "курица, лапша, морковь" }),
  demo("demo-122", "Плов с индейкой готовый", 279, "готовая еда", { rating: 4.4, weightLabel: "280 г", composition: "рис, индейка, морковь" }),
  demo("demo-123", "Паста с томатным соусом", 259, "готовая еда", { rating: 4.3, weightLabel: "300 г", composition: "макароны, томаты, сыр" }),
  demo("demo-124", "Хумус классический", 139, "перекус", { rating: 4.7, weightLabel: "200 г", composition: "нут, тахини, масло" }),
  demo("demo-125", "Ореховая смесь", 249, "перекус", { rating: 4.8, weightLabel: "150 г", composition: "миндаль, кешью, фундук" }),
  demo("demo-126", "Яблоки сезонные", 129, "фрукты перекус", { rating: 4.6, weightLabel: "1 кг" }),
  demo("demo-127", "Хлеб цельнозерновой", 95, "хлеб", { rating: 4.5, weightLabel: "300 г", composition: "мука, вода, закваска" }),
  demo("demo-128", "Молоко 2,5%", 98, "молоко", { rating: 4.7, weightLabel: "1 л", composition: "молоко" }),
];
