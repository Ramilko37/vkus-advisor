import { createYandexLavkaAdapter } from "../src/services/yandexLavkaCatalog.mjs";

const [address, ...requestedQueries] = process.argv.slice(2);
const queries = requestedQueries.length ? requestedQueries : ["молоко", "яйца", "курица", "гречка", "овощи", "сыр", "хлеб", "готовая еда"];

if (!address) {
  console.error("Usage: node scripts/lavka-spike.mjs \"Москва, Тверская 1\" [query ...]");
  process.exitCode = 1;
} else {
  const adapter = createYandexLavkaAdapter({
    session: process.env.YANDEX_LAVKA_SESSION_JSON,
    baseUrl: process.env.LAVKA_API_BASE_URL,
    timeoutMs: process.env.LAVKA_API_TIMEOUT_MS,
    limit: process.env.LAVKA_SEARCH_LIMIT,
    cacheTtlMs: process.env.LAVKA_SEARCH_CACHE_TTL_MS,
  });
  for (const query of queries) {
    const startedAt = performance.now();
    try {
      const products = await adapter.searchProducts({ query, sort: "popularity" }, address);
      console.log({
        query,
        latency: Math.round(performance.now() - startedAt),
        count: products.length,
        topProducts: products.slice(0, 5).map(({ name, priceRub, availability, priceObservedAt }) => ({ name, priceRub, availability, priceObservedAt })),
      });
    } catch (error) {
      console.error({ query, latency: Math.round(performance.now() - startedAt), errorType: error?.name || "Error" });
    }
  }
}
