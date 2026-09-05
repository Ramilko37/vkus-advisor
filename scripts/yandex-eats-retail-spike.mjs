import { parseArgs } from "node:util";
import { createYandexEatsRetailAdapter } from "../src/services/yandexEatsRetailCatalog.mjs";

const { values } = parseArgs({ options: { address: { type: "string" }, lat: { type: "string" }, lon: { type: "string" }, load: { type: "boolean", default: false } } });
const queries = ["молоко", "яйца", "курица", "гречка", "овощи", "сыр", "хлеб", "готовая еда"];
const report = { date: new Date().toISOString(), mode: "candidates_only", stages: {} };
const api = createYandexEatsRetailAdapter({ enabled: true, mode: "candidates_only", baseUrl: process.env.YANDEX_EATS_BASE_URL, searchCacheTtlMs: 0, logger: () => {} });

try {
  let location;
  if (values.address) {
    const { geocodeWithDadata } = await import("../server.mjs");
    const coordinates = await geocodeWithDadata(values.address);
    if (!coordinates) throw new Error("Address could not be resolved through existing DaData integration");
    location = { lat: coordinates.latitude, lon: coordinates.longitude };
  } else {
    if (values.lat === undefined || values.lon === undefined) throw new Error("Use --lat 55.7558 --lon 37.6173 or --address 'Москва, Тверская 1'");
    location = { lat: Number(values.lat), lon: Number(values.lon) };
  }
  const places = await api.resolveRetailPlaces(location);
  report.stages.A = { passed: places.length >= 5, places, locationSpecificity: "Compare a second address and delivery-zone evidence before rollout", session: "anonymous" };
  const selected = ["magnit", "perekrestok", "metro", "auchan", "dixy"].flatMap(retailer => places.find(p => p.retailer === retailer) ?? []);
  const samples = [];
  const searches = [];
  for (const place of selected) {
    for (const query of queries) {
      const started = performance.now();
      try {
        const products = await api.searchProducts({ query, sort: "popularity" }, { ...location, ...place });
        searches.push({ retailer: place.retailer, query, latencyMs: Math.round(performance.now() - started), count: products.length, topSku: products[0] });
        samples.push(...products.map(product => ({ product, place })));
      } catch (error) {
        searches.push({ retailer: place.retailer, query, error: error.name, status: error.status });
        if ([403, 429].includes(error.status)) throw error;
      }
    }
  }
  report.stages.B = { searches, retailersWithProducts: [...new Set(searches.filter(s => s.count > 0).map(s => s.retailer))] };
  const unique = [...new Map(samples.map(sample => [sample.product.xmlId, sample])).values()].slice(0, 10);
  const rechecks = [];
  for (const { product, place } of unique) {
    try {
      const fresh = await api.verifyItems([{ ...product, quantity: 1 }], { ...location, ...place });
      const exact = fresh.find(p => p.xmlId === product.xmlId);
      rechecks.push({ xmlId: product.xmlId, exact: Boolean(exact), priceRub: exact?.priceRub, availability: exact?.availability });
    } catch (error) {
      rechecks.push({ xmlId: product.xmlId, exact: false, error: error.name });
    }
  }
  report.stages.C = { passed: false, reason: "Exact read-only goods contract remains unproven; repeated search is not validation", rechecks };
  report.stages.D = { skipped: !values.load, reason: "Use --load for 50 uncached searches at concurrency 1 and 3" };
  if (values.load && selected.length) {
    report.stages.D = { runs: [] };
    for (const concurrency of [1, 3]) {
      const loadApi = createYandexEatsRetailAdapter({ enabled: true, mode: "candidates_only", baseUrl: process.env.YANDEX_EATS_BASE_URL, searchCacheTtlMs: 0, concurrency, logger: () => {} });
      let next = 0;
      let stopped = false;
      const results = [];
      await Promise.all(Array.from({ length: concurrency }, async () => {
        while (!stopped && next < 50) {
          const index = next++;
          const place = selected[index % selected.length];
          try {
            await loadApi.searchProducts({ query: queries[index % queries.length], sort: "popularity" }, { ...location, ...place });
            results.push({ ok: true });
          } catch (error) {
            results.push({ error: error.name, status: error.status });
            if ([403, 429].includes(error.status)) stopped = true;
          }
        }
      }));
      report.stages.D.runs.push({ concurrency, stopped, results, metrics: loadApi.metrics, p95Ms: percentile(loadApi.metrics.latencyMs) });
      if (stopped) break;
    }
  }
} catch (error) {
  report.blocker = { name: error.name, message: error.message, status: error.status };
  for (const stage of ["A", "B", "C", "D"]) report.stages[stage] ??= { skipped: true, reason: "Upstream precondition failed" };
  process.exitCode = 1;
} finally {
  report.providerStatus = api.status();
  report.metrics = api.metrics;
  report.p95Ms = percentile(api.metrics.latencyMs);
  console.log(JSON.stringify(report, null, 2));
}

function percentile(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1] : null;
}
