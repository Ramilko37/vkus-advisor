import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createCatalogProviderStatus, parseEnvBoolean } from "./src/services/catalogProviderStatus.mjs";
import { createLentaCatalogAdapter } from "./src/services/lentaCatalog.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
loadDotEnv();

const distDir = resolve(__dirname, "dist");
const port = Number(process.env.PORT || 5174);
const llmProvider = normalizeLlmProvider(process.env.LLM_PROVIDER);
const neuralDeepBaseUrl = (process.env.NEURALDEEP_API_BASE_URL || "https://api.neuraldeep.ru/v1").replace(/\/$/, "");
const neuralDeepUrl = process.env.NEURALDEEP_API_URL || `${neuralDeepBaseUrl}/chat/completions`;
const defaultNeuralDeepModel = "qwen3.6-fp8-noreason";
const openRouterUrl = process.env.OPENROUTER_API_URL || "https://openrouter.ai/api/v1/chat/completions";
const defaultStructuredModel = "nvidia/nemotron-3-super-120b-a12b:free";
const legacyModel = process.env.OPENROUTER_MODEL;
const neuralDeepLegacyModel = process.env.NEURALDEEP_MODEL;
const neuralDeepIntentModel = process.env.NEURALDEEP_INTENT_MODEL || neuralDeepLegacyModel || defaultNeuralDeepModel;
const neuralDeepBasketModel = process.env.NEURALDEEP_BASKET_MODEL || neuralDeepLegacyModel || defaultNeuralDeepModel;
const openRouterIntentModel = process.env.OPENROUTER_INTENT_MODEL || legacyModel || defaultStructuredModel;
const openRouterBasketModel = process.env.OPENROUTER_BASKET_MODEL || legacyModel || defaultStructuredModel;
const intentFallbackModel = process.env.OPENROUTER_INTENT_FALLBACK_MODEL || process.env.OPENROUTER_FALLBACK_MODEL || "dots-studio/dots-3-note-preview:free";
const basketFallbackModel = process.env.OPENROUTER_BASKET_FALLBACK_MODEL || process.env.OPENROUTER_FALLBACK_MODEL || "dots-studio/dots-3-note-preview:free";
const openRouterReferer = process.env.OPENROUTER_HTTP_REFERER || `http://127.0.0.1:${port}`;
const openRouterTitle = process.env.OPENROUTER_APP_TITLE || "Basket Task Prototype";
const pyaterochkaMcpUrl = process.env.PYATEROCHKA_MCP_URL || "";
const pyaterochkaConfiguredStoreId = process.env.PYATEROCHKA_STORE_ID || "";
const pyaterochkaAddress = process.env.PYATEROCHKA_ADDRESS || "";
const pyaterochkaMaxSearchResultsPerQuery = Number(process.env.PYATEROCHKA_SEARCH_RESULTS_PER_QUERY || 4);
const lentaEnabled = parseEnvBoolean(process.env.LENTA_ENABLED, true);
const lentaBaseUrl = process.env.LENTA_API_BASE_URL || "https://integration.api.lenta.com";
const lentaRetailBrand = process.env.LENTA_RETAIL_BRAND || "lo";
const lentaChannel = process.env.LENTA_CHANNEL || "lo";
const lentaApiTimeoutMs = Number(process.env.LENTA_API_TIMEOUT_MS || 5000);
const mcpUrls = [
  process.env.VKUSVILL_MCP_URL || "https://mcp.vkusvill.ru/mcp",
  "https://mcp001.vkusvill.ru/mcp",
];
const maxSearchResultsPerQuery = Number(process.env.MAX_SEARCH_RESULTS_PER_QUERY || 4);
const searchCacheTtlMs = 3 * 60 * 1000;
const detailsCacheTtlMs = 30 * 60 * 1000;

let mcpClient = null;
let pyaterochkaMcpClient = null;
let pyaterochkaStoreId = "";
let pyaterochkaStoreAddress = "";
let pyaterochkaUnavailableUntil = 0;
let lentaAdapter = null;
let lentaAdapterKey = "";
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
      llmProvider,
      llmConfigured: isActiveLlmConfigured(),
      llmApiUrl: llmProvider === "openrouter" ? openRouterUrl : neuralDeepUrl,
      neuralDeepConfigured: Boolean(process.env.NEURALDEEP_API_KEY),
      neuralDeepApiUrl: neuralDeepUrl,
      openRouterConfigured: Boolean(process.env.OPENROUTER_API_KEY),
      openRouterApiUrl: openRouterUrl,
      intentModel: effectiveModel(activeModel("intent")),
      basketModel: effectiveModel(activeModel("basket")),
      openRouterReferer,
      openRouterTitle,
      ...catalogProviderStatus(),
    });
    if (url.pathname === "/api/llm" && req.method === "POST") return await handleLlm(req, res);
    if (url.pathname === "/api/openrouter" && req.method === "POST") return await handleOpenRouter(req, res);
    if (url.pathname === "/api/address/suggest" && req.method === "POST") return await handleAddressSuggest(req, res);
    if (url.pathname === "/api/address/geolocate" && req.method === "POST") return await handleAddressGeolocate(req, res);
    if (url.pathname === "/api/catalog/status") return await handleCatalogStatus(res);
    if (url.pathname === "/api/catalog/lenta/stores" && req.method === "POST") return await handleLentaStores(req, res);
    if (url.pathname === "/api/catalog/search" && req.method === "POST") return await handleCatalogSearch(req, res);
    if (url.pathname === "/api/catalog/details") return await handleCatalogDetails(url, res);
    if (url.pathname === "/api/catalog/validate" && req.method === "POST") return await handleCatalogValidate(req, res);
    if (url.pathname === "/api/catalog/cart" && req.method === "POST") return await handleCart(req, res);
    return await serveStatic(url, res);
  } catch (error) {
    send(res, error?.status || 500, { error: error instanceof Error ? error.message : "Server error" });
  }
}

async function handleAddressSuggest(req, res) {
  const { query } = await readJson(req);
  const normalizedQuery = cleanText(stringValue(query)).slice(0, 300);
  if (normalizedQuery.length < 3) return send(res, 200, { suggestions: [] });
  return send(res, 200, {
    suggestions: await requestDadataAddresses(
      "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address",
      { query: normalizedQuery, count: 5 },
    ),
  });
}

async function handleAddressGeolocate(req, res) {
  const { lat, lon } = await readJson(req);
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return send(res, 400, { error: "Invalid coordinates" });
  }
  return send(res, 200, {
    suggestions: await requestDadataAddresses(
      "https://suggestions.dadata.ru/suggestions/api/4_1/rs/geolocate/address",
      { lat: latitude, lon: longitude, count: 5, radius_meters: 100 },
    ),
  });
}

async function requestDadataAddresses(url, body) {
  const suggestions = await requestDadataSuggestions(url, body);
  return suggestions.map((suggestion) => cleanText(stringValue(suggestion?.value))).filter(Boolean);
}

async function requestDadataSuggestions(url, body) {
  const apiKey = process.env.DADATA_API_KEY;
  if (!apiKey) {
    const error = new Error("Address suggestions are not configured");
    error.status = 503;
    throw error;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    const error = new Error(cause?.name === "AbortError" ? "Address service timeout" : "Address service unavailable");
    error.status = cause?.name === "AbortError" ? 504 : 502;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const error = new Error("Address service unavailable");
    error.status = response.status === 429 ? 429 : 502;
    throw error;
  }
  const payload = await response.json();
  return Array.isArray(payload?.suggestions) ? payload.suggestions.slice(0, 5) : [];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createServer(handleRequest).listen(port, "127.0.0.1", () => {
    console.log(`Server ready: http://127.0.0.1:${port}`);
  });
}

async function handleOpenRouter(req, res) {
  if (llmProvider !== "openrouter") return send(res, 410, { error: "OpenRouter provider is not active. Set LLM_PROVIDER=openrouter to enable legacy endpoint." });
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return send(res, 401, { error: "OPENROUTER_API_KEY is missing" });
  const body = await readJson(req);
  const result = await openRouterRequest(apiKey, body);
  return send(res, 200, result);
}

async function handleLlm(req, res) {
  const body = await readJson(req);
  if (llmProvider === "openrouter") {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return send(res, 401, { error: "OPENROUTER_API_KEY is missing" });
    return send(res, 200, await openRouterRequest(apiKey, body));
  }

  const apiKey = process.env.NEURALDEEP_API_KEY;
  if (!apiKey) return send(res, 401, { error: "NEURALDEEP_API_KEY is missing" });
  return send(res, 200, await neuralDeepStructuredRequest(apiKey, body));
}

export async function neuralDeepStructuredRequest(apiKey, body, options = {}) {
  const baseConfig = generationConfig(body.stage, "neuraldeep");
  const config = {
    ...baseConfig,
    model: options.model ?? baseConfig.model,
    fallbackModel: options.fallbackModel === undefined ? baseConfig.fallbackModel : options.fallbackModel,
    temperature: options.temperature ?? baseConfig.temperature,
    maxTokens: options.maxTokens ?? body.maxTokens ?? baseConfig.maxTokens,
  };
  const models = [config.model, config.fallbackModel || config.model]
    .filter((model, index, all) => model && all.indexOf(model) === index)
    .slice(0, 2);
  const formats = options.formats || ["json_schema", "json_object"];
  let lastError = null;
  let attempt = 0;
  for (const model of models) {
    for (const format of formats) {
      try {
        const result = await neuralDeepFetch(apiKey, body, format, model, config, attempt);
        return {
          ...result,
          retryCount: attempt,
          fallbackModelUsed: model !== config.model,
        };
      } catch (error) {
        lastError = error;
        if (!options.silent) console.warn("neuraldeep_attempt_failed", {
          stage: config.stage,
          model,
          format,
          status: error?.status,
          neuralDeepStatus: error?.neuralDeepStatus,
          message: String(error?.message || error).slice(0, 240),
        });
        attempt += 1;
        if (!isRetryableLlmError(error)) throw error;
      }
    }
  }
  throw lastError;
}

export async function openRouterStructuredRequest(apiKey, body, options = {}) {
  const baseConfig = generationConfig(body.stage, "openrouter");
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
  const choice = payload?.choices?.[0];
  if (!choice) {
    const error = new Error("Invalid OpenRouter response shape");
    error.status = 502;
    error.openRouterStatus = 502;
    throw error;
  }
  const content = choice.message?.content || "";
  const finishReason = choice.finish_reason;
  if (finishReason === "content_filter") {
    const error = new Error("OpenRouter content filter");
    error.status = 422;
    throw error;
  }
  const parsed = extractJsonFromText(content);
  if (!parsed?.ok) {
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

async function neuralDeepFetch(apiKey, body, format, model, config, retryIndex) {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  let response;
  try {
    response = await fetch(neuralDeepUrl, {
      method: "POST",
      signal: controller.signal,
      headers: neuralDeepHeaders(apiKey),
      body: JSON.stringify(neuralDeepBody(body, format, model, config, retryIndex)),
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("NeuralDeep request timeout");
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
    const error = new Error(text || `NeuralDeep ${response.status}`);
    error.status = status;
    error.neuralDeepStatus = response.status;
    throw error;
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    const error = new Error("Invalid NeuralDeep response JSON");
    error.status = 502;
    error.neuralDeepStatus = 502;
    throw error;
  }
  const choice = payload?.choices?.[0];
  if (!choice) {
    const error = new Error("Invalid NeuralDeep response shape");
    error.status = 502;
    error.neuralDeepStatus = 502;
    throw error;
  }
  const content = choice.message?.content || "";
  const finishReason = choice.finish_reason;
  if (finishReason === "content_filter") {
    const error = new Error("NeuralDeep content filter");
    error.status = 422;
    throw error;
  }
  const parsed = extractJsonFromText(content);
  if (!parsed?.ok) {
    const error = new Error("Invalid NeuralDeep JSON");
    error.status = finishReason === "length" ? 504 : 502;
    error.content = content;
    error.finishReason = finishReason;
    error.neuralDeepStatus = error.status;
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

function neuralDeepHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
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

function neuralDeepBody(body, format, model, config, retryIndex) {
  const requestBody = {
    model,
    messages: [
      { role: "system", content: String(body.systemPrompt || "") },
      { role: "user", content: openRouterUserContent(body) },
    ],
    temperature: config.temperature,
    max_tokens: retryIndex ? Math.min(Math.ceil(config.maxTokens * 1.25), config.stage === "basket" ? 2400 : 900) : config.maxTokens,
    stream: false,
    response_format: format === "json_schema"
      ? { type: "json_schema", json_schema: { name: "response", strict: true, schema: body.jsonSchema } }
      : { type: "json_object" },
    user: body.sessionId,
  };
  if (model.startsWith("qwen3.")) requestBody.chat_template_kwargs = { enable_thinking: false };
  return requestBody;
}

function openRouterUserContent(body) {
  const payload = JSON.stringify(body.userPayload ?? {});
  return body.jsonSchema ? `${payload}\n\nJSON Schema:\n${JSON.stringify(body.jsonSchema)}` : payload;
}

function isRetryableLlmError(error) {
  const text = String(error?.message || error);
  return error?.neuralDeepStatus >= 500
    || /upstream|temporarily|timeout|unavailable|Invalid NeuralDeep JSON|response_format|json_schema|grammar|guided/i.test(text);
}

function isRetryableOpenRouterError(error) {
  const text = String(error?.message || error);
  return error?.openRouterStatus >= 500
    || /Provider returned error|unavailable|real-time inference|temporarily unavailable|Invalid OpenRouter JSON|reasoning|response_format|json_schema|unsupported|parameters/i.test(text);
}

function generationConfig(stage, provider = llmProvider) {
  const isBasket = stage === "basket";
  return {
    stage: isBasket ? "basket" : "intent",
    model: provider === "openrouter" ? (isBasket ? openRouterBasketModel : openRouterIntentModel) : (isBasket ? neuralDeepBasketModel : neuralDeepIntentModel),
    fallbackModel: provider === "openrouter" ? (isBasket ? basketFallbackModel : intentFallbackModel) : undefined,
    temperature: isBasket ? 0.1 : 0,
    maxTokens: Number(isBasket
      ? process.env.NEURALDEEP_BASKET_MAX_TOKENS || process.env.OPENROUTER_BASKET_MAX_TOKENS || 1800
      : process.env.NEURALDEEP_INTENT_MAX_TOKENS || process.env.OPENROUTER_INTENT_MAX_TOKENS || 600),
    timeoutMs: Number(isBasket
      ? process.env.NEURALDEEP_BASKET_TIMEOUT_MS || process.env.OPENROUTER_BASKET_TIMEOUT_MS || 75_000
      : process.env.NEURALDEEP_INTENT_TIMEOUT_MS || process.env.OPENROUTER_INTENT_TIMEOUT_MS || 45_000),
    providerSort: isBasket ? "throughput" : "latency",
  };
}

function activeModel(stage) {
  return generationConfig(stage).model;
}

function isActiveLlmConfigured() {
  return llmProvider === "openrouter" ? Boolean(process.env.OPENROUTER_API_KEY) : Boolean(process.env.NEURALDEEP_API_KEY);
}

function normalizeLlmProvider(provider) {
  return String(provider || "neuraldeep").toLocaleLowerCase("en-US") === "openrouter" ? "openrouter" : "neuraldeep";
}

function effectiveModel(model) {
  return model === "openrouter/free" ? defaultStructuredModel : model;
}

async function handleCatalogStatus(res) {
  await ensureMcp();
  send(res, 200, { mode: catalogMode, ...catalogProviderStatus() });
}

function catalogProviderStatus() {
  return createCatalogProviderStatus({
    env: process.env,
    catalogMode,
    lentaStoreResolved: Boolean(lentaAdapter?.currentStoreId),
    pyaterochkaConnected: Boolean(pyaterochkaMcpClient),
    pyaterochkaStoreState: pyaterochkaStoreId ? "resolved" : pyaterochkaConfiguredStoreId ? "configured" : pyaterochkaStoreAddress || pyaterochkaAddress ? "address" : "missing",
  });
}

async function handleCatalogSearch(req, res) {
  const query = await readJson(req);
  const address = cleanText(stringValue(query.address));
  const lentaStore = selectedLentaStore(query);
  await ensureMcp(address);
  const liveProducts = [];
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
      liveProducts.push(...products);
    } catch {
      mcpClient = null;
      catalogMode = pyaterochkaMcpClient ? "live" : "demo";
    }
  }
  if (pyaterochkaMcpClient && pyaterochkaStoreId) {
    try {
      const cacheKey = `pyaterochka:${pyaterochkaStoreId}:${normalizeCacheKey(query.query)}:${query.sort || "popularity"}`;
      const products = await cached(cacheKey, searchCache, inFlightSearches, searchCacheTtlMs, async () => {
        const payload = await callPyaterochkaMcp("search_products", {
          store_id: pyaterochkaStoreId,
          query: query.query,
          sort: pyaterochkaSort(query.sort),
          limit: pyaterochkaMaxSearchResultsPerQuery,
          offset: 0,
        });
        return extractProductList(parseMcpResponse(payload))
          .map((item) => normalizePyaterochkaProduct(item, query.query))
          .filter(Boolean)
          .slice(0, pyaterochkaMaxSearchResultsPerQuery);
      });
      liveProducts.push(...products);
    } catch {
      pyaterochkaMcpClient = null;
      pyaterochkaUnavailableUntil = Date.now() + 60_000;
    }
  }
  if (lentaEnabled && address && lentaStore.id) {
    try {
      const products = await getLentaAdapter(address, lentaStore).searchProducts(query, address);
      liveProducts.push(...products);
    } catch (error) {
      logCatalogError("lenta", "search", error);
    }
  }
  if (liveProducts.length) return send(res, 200, { mode: "live", products: dedupeByXmlId(liveProducts) });
  send(res, 200, { mode: "demo", products: searchDemo(query).slice(0, 5) });
}

async function handleLentaStores(req, res) {
  const body = await readJson(req);
  const address = cleanText(stringValue(body.address));
  if (!address) return send(res, 400, { error: "Delivery address is required" });
  const adapter = createConfiguredLentaAdapter();
  let stores = await adapter.listStores(address);
  if (!stores.length && process.env.DADATA_API_KEY) {
    const coordinates = await geocodeWithDadata(address);
    if (coordinates) stores = await adapter.listStores(`${coordinates.latitude},${coordinates.longitude}`);
  }
  return send(res, 200, { stores });
}

async function geocodeWithDadata(address) {
  const [suggestion] = await requestDadataSuggestions(
    "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address",
    { query: address, count: 1 },
  );
  const latitude = Number(suggestion?.data?.geo_lat);
  const longitude = Number(suggestion?.data?.geo_lon);
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    ? { latitude, longitude }
    : null;
}

async function handleCatalogDetails(url, res) {
  const id = url.searchParams.get("id") || "";
  await ensureMcp();
  if (id.startsWith("lenta:") && lentaEnabled && lentaAdapter?.hasStore()) {
    try {
      return send(res, 200, await lentaAdapter.getProductDetails(id));
    } catch (error) {
      logCatalogError("lenta", "getOffers", error);
    }
  }
  if (id.startsWith("pyaterochka:") && pyaterochkaMcpClient && pyaterochkaStoreId) {
    try {
      const payload = await callPyaterochkaMcp("get_product_info", { store_id: pyaterochkaStoreId, plu: id.replace(/^pyaterochka:/, "") });
      return send(res, 200, normalizePyaterochkaProduct(parseMcpResponse(payload), "details") || {});
    } catch {
      pyaterochkaMcpClient = null;
      pyaterochkaUnavailableUntil = Date.now() + 60_000;
    }
  }
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

async function handleCatalogValidate(req, res) {
  const body = await readJson(req);
  const address = cleanText(stringValue(body.address));
  const lentaStore = selectedLentaStore(body);
  const items = (body.items || []).slice(0, 20);
  const result = { products: [], unavailableXmlIds: [], changedPrices: [] };
  const lentaItems = items.filter((item) => String(item.xmlId || "").startsWith("lenta:"));
  if (lentaItems.length && lentaEnabled && address && lentaStore.id) {
    try {
      const products = await getLentaAdapter(address, lentaStore).verifyCartItems(lentaItems, address);
      const productMap = new Map(products.map((product) => [product.xmlId, product]));
      result.products.push(...products);
      for (const item of lentaItems) {
        const product = productMap.get(item.xmlId);
        if (!product || product.availability === "unavailable") result.unavailableXmlIds.push(item.xmlId);
      }
      for (const product of products) {
        const original = lentaItems.find((item) => item.xmlId === product.xmlId);
        if (original && Number(original.priceRub) > 0 && Math.round(Number(original.priceRub)) !== Math.round(product.priceRub)) {
          result.changedPrices.push({ xmlId: product.xmlId, oldPriceRub: Number(original.priceRub), newPriceRub: product.priceRub });
        }
      }
    } catch (error) {
      logCatalogError("lenta", "validate", error);
    }
  }
  send(res, 200, result);
}

async function handleCart(req, res) {
  const body = await readJson(req);
  await ensureMcp();
  const lentaItems = (body.items || []).filter((item) => String(item.xmlId || "").startsWith("lenta:"));
  if (lentaItems.length) {
    return send(res, 409, { error: "Lenta SKU were rechecked through /api/catalog/validate. Public cart links are not available for Lenta yet." });
  }
  if (catalogMode !== "live" || !mcpClient) return send(res, 409, { error: "Demo mode cannot create cart links" });
  const items = (body.items || []).slice(0, 20);
  if (items.some((item) => !/^\d+$/.test(String(item.xmlId)))) {
    return send(res, 409, { error: "Cart links are available only for VkusVill products. Copy the list for other retailers." });
  }
  const products = items.map((item) => ({ xml_id: Number(item.xmlId), q: item.quantity }));
  const payload = await callMcp("vkusvill_cart_link_create", { products });
  const url = extractCartUrl(parseMcpResponse(payload));
  if (!url) return send(res, 502, { error: "Invalid cart URL" });
  send(res, 200, { url });
}

async function ensureMcp(address = "") {
  if (!mcpClient) {
    for (const endpoint of mcpUrls) {
      try {
        const client = new Client({ name: "basket-task-server", version: "0.1.0" });
        const transport = new StreamableHTTPClientTransport(new URL(endpoint));
        await withTimeout(client.connect(transport), 10_000);
        mcpClient = client;
        catalogMode = "live";
        break;
      } catch {
        mcpClient = null;
        catalogMode = "demo";
      }
    }
  }
  await ensurePyaterochkaMcp(address);
  catalogMode = mcpClient || pyaterochkaMcpClient ? "live" : "demo";
}

function callMcp(name, args) {
  return withTimeout(mcpClient.callTool({ name, arguments: args }), 20_000);
}

async function ensurePyaterochkaMcp(address = "") {
  const desiredAddress = cleanText(stringValue(address || pyaterochkaAddress));
  if (!pyaterochkaShouldConnect(desiredAddress) || Date.now() < pyaterochkaUnavailableUntil) return;
  if (pyaterochkaMcpClient && pyaterochkaStoreId && (pyaterochkaConfiguredStoreId || desiredAddress === pyaterochkaStoreAddress)) return;
  try {
    let client = pyaterochkaMcpClient;
    if (!client) {
      client = new Client({ name: "basket-task-pyaterochka", version: "0.1.0" });
      const transport = new StreamableHTTPClientTransport(new URL(pyaterochkaMcpUrl));
      await withTimeout(client.connect(transport), 10_000);
    }
    pyaterochkaMcpClient = client;
    pyaterochkaStoreId = pyaterochkaConfiguredStoreId || await resolvePyaterochkaStoreId(client, desiredAddress);
    pyaterochkaStoreAddress = desiredAddress;
    if (!pyaterochkaStoreId) throw new Error("Pyaterochka store is not resolved");
  } catch {
    pyaterochkaMcpClient = null;
    pyaterochkaStoreId = "";
    pyaterochkaStoreAddress = "";
    pyaterochkaUnavailableUntil = Date.now() + 60_000;
  }
}

function pyaterochkaShouldConnect(address = "") {
  return Boolean(pyaterochkaMcpUrl && (pyaterochkaConfiguredStoreId || address || pyaterochkaAddress));
}

async function resolvePyaterochkaStoreId(client, address) {
  if (!address) return "";
  const payload = await withTimeout(client.callTool({ name: "find_store", arguments: { address } }), 20_000);
  return extractPyaterochkaStoreId(parseMcpResponse(payload));
}

function callPyaterochkaMcp(name, args) {
  return withTimeout(pyaterochkaMcpClient.callTool({ name, arguments: args }), 20_000);
}

function getLentaAdapter(address = "", store = {}) {
  const key = `${normalizeCacheKey(address)}:${store.id || ""}`;
  if (!lentaAdapter || lentaAdapterKey !== key) {
    lentaAdapter = createConfiguredLentaAdapter({
      address,
      storeId: store.id,
      storeName: store.name,
      storeAddress: store.address,
    });
    lentaAdapterKey = key;
  }
  return lentaAdapter;
}

function createConfiguredLentaAdapter(options = {}) {
  return createLentaCatalogAdapter({
    baseUrl: lentaBaseUrl,
    retailBrand: lentaRetailBrand,
    channel: lentaChannel,
    timeoutMs: lentaApiTimeoutMs,
    limit: maxSearchResultsPerQuery,
    ...options,
  });
}

function selectedLentaStore(value) {
  return {
    id: cleanText(stringValue(value.lentaStoreId)),
    name: cleanText(stringValue(value.lentaStoreName)),
    address: cleanText(stringValue(value.lentaStoreAddress)),
  };
}

function logCatalogError(retailer, operation, error) {
  console.warn("catalog_request_failed", {
    retailer,
    operation,
    errorType: error?.name || "Error",
    status: error?.status,
  });
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
    return parsed?.ok ? parsed.value : value;
  }
  const content = value?.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (typeof part.text === "string") {
        const parsed = extractJsonFromText(part.text);
        return parsed?.ok ? parsed.value : part.text;
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
    retailer: "vkusvill",
    name: cleanText(name),
    priceRub,
    oldPriceRub: numberValue(raw?.oldPriceRub ?? raw?.old_price) || numberValue(raw?.price?.old),
    rating: numberValue(raw?.rating) || numberValue(raw?.rating?.average),
    reviewsCount: numberValue(raw?.reviewsCount ?? raw?.reviews_count) || numberValue(raw?.rating?.count),
    weightLabel: stringValue(raw?.weightLabel ?? raw?.weight ?? raw?.volume),
    imageUrl: imageValue(raw),
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

function normalizePyaterochkaProduct(raw, sourceQuery) {
  const value = raw?.data || raw;
  const plu = stringValue(value?.plu ?? value?.xml_id ?? value?.xmlId ?? value?.id);
  const name = stringValue(value?.name ?? value?.title ?? value?.product_name);
  const priceRub = numberValue(value?.priceRub ?? value?.price ?? value?.current_price ?? value?.cpd_price);
  if (!plu || !name || !priceRub || priceRub <= 0) return null;
  return {
    id: `pyaterochka:${plu}`,
    xmlId: `pyaterochka:${plu}`,
    retailer: "pyaterochka",
    name: cleanText(name),
    priceRub,
    oldPriceRub: numberValue(value?.oldPriceRub ?? value?.old_price),
    rating: numberValue(value?.rating),
    reviewsCount: numberValue(value?.reviewsCount ?? value?.rating_count),
    weightLabel: stringValue(value?.size ?? value?.unit ?? value?.weight),
    imageUrl: imageValue(value),
    productUrl: stringValue(value?.url ?? value?.productUrl ?? value?.link),
    description: cleanText(stringValue(value?.description)),
    composition: cleanText(stringValue(value?.ingredients ?? value?.composition)),
    calories: numberValue(value?.calories ?? value?.calories_per_100g),
    proteins: numberValue(value?.proteins ?? value?.protein_per_100g),
    fats: numberValue(value?.fats ?? value?.fat_per_100g),
    carbohydrates: numberValue(value?.carbohydrates ?? value?.carbs_per_100g),
    sourceQuery,
    isDemo: false,
  };
}

function normalizeDetails(raw) {
  const value = raw?.data || raw;
  return normalizeProduct(value, "details", false) || {
    imageUrl: imageValue(value),
    productUrl: stringValue(value?.url ?? value?.productUrl ?? value?.link),
    description: cleanText(stringValue(value?.description)),
    composition: cleanText(stringValue(value?.composition ?? value?.ingredients)) || propertyValue(value, "состав"),
    calories: numberValue(value?.calories),
    proteins: numberValue(value?.proteins),
    fats: numberValue(value?.fats),
    carbohydrates: numberValue(value?.carbohydrates),
  };
}

function extractPyaterochkaStoreId(raw) {
  const store = raw?.store || raw?.data?.store || raw?.stores?.[0] || raw?.data?.stores?.[0] || raw;
  return stringValue(store?.store_id ?? store?.sap_code ?? store?.id) || "";
}

function pyaterochkaSort(sort) {
  return sort === "price_asc" || sort === "price_desc" ? sort : "popularity";
}

function dedupeByXmlId(products) {
  const map = new Map();
  for (const product of products) {
    const current = map.get(product.xmlId);
    if (!current || Object.values(product).filter(Boolean).length > Object.values(current).filter(Boolean).length) map.set(product.xmlId, product);
  }
  return Array.from(map.values());
}

function imageValue(raw) {
  const direct = stringValue(raw?.image ?? raw?.imageUrl ?? raw?.image_url ?? raw?.picture ?? raw?.photo ?? raw?.thumbnail);
  if (direct) return direct;
  if (!Array.isArray(raw?.images)) return undefined;
  for (const item of raw.images) {
    const url = stringValue(item?.medium ?? item?.small ?? item?.large ?? item?.url);
    if (url) return url;
  }
  return undefined;
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
