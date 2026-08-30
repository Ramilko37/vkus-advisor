import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const args = parseArgs(process.argv.slice(2));
const baseUrl = stripSlash(args.baseUrl || process.env.LENTA_API_BASE_URL || "https://integration.api.lenta.com");
const retailBrand = args.retailBrand || process.env.LENTA_RETAIL_BRAND || "lo";
const channel = args.channel || process.env.LENTA_CHANNEL || "lo";
const limit = Number(args.limit || 5);
const outDir = args.out || join(".lenta-spike", new Date().toISOString().replace(/[:.]/g, "-"));
const queries = arrayArg(args.query).length ? arrayArg(args.query) : ["молоко", "куриное филе", "макароны", "яблоки", "яйца", "сыр"];

const points = parsePoints(args);
if (!points.length) {
  console.error("Usage: node scripts/lenta-spike.mjs --lat 55.7558 --lon 37.6173 [--query молоко]");
  process.exit(1);
}

await mkdir(outDir, { recursive: true });

for (const point of points) {
  const label = point.label || `${point.lat},${point.lon}`;
  console.log(`\nPoint: ${label}`);
  const nearest = await request("resolve-store", "/v1/stores/nearest/hub", {
    latitude: point.lat,
    longitude: point.lon,
    retailBrand,
  });
  const stores = nearest.body?.hubs || nearest.body?.data?.hubs || nearest.body?.stores || nearest.body?.data || [];
  const storeCandidates = nearestStores(stores);
  let store = storeCandidates[0];
  if (!store?.id) {
    console.log("  store: not found");
    continue;
  }
  console.log(`  store: ${store.id} ${store.name || ""} ${store.address || ""}`.trim());

  const selectedIds = [];
  for (const query of queries) {
    let items = [];
    let search = null;
    for (const candidate of [store, ...storeCandidates.filter((item) => item.id !== store.id)].slice(0, 4)) {
      search = await request(`search-${slug(query)}-store-${candidate.id}`, "/catalog/v1/items", {
        stores: candidate.id,
        channel,
        retailBrand,
        query,
        limit,
        offset: 0,
      });
      items = extractItems(search.body);
      if (items.length) {
        store = candidate;
        break;
      }
    }
    selectedIds.push(...items.slice(0, 2).map((item) => item.id).filter(Boolean));
    console.log(`  search "${query}": store=${store.id} status=${search.status} latency=${Math.round(search.latencyMs)}ms count=${items.length}`);
  }

  const ids = [...new Set(selectedIds)].slice(0, 6);
  for (const id of ids.slice(0, 3)) {
    const details = await request(`details-${id}`, `/catalog/v1/items/${encodeURIComponent(id)}`, {
      stores: store.id,
      channel,
      retailBrand,
    });
    console.log(`  details ${id}: status=${details.status} latency=${Math.round(details.latencyMs)}ms`);
  }
  if (ids.length) {
    const validation = await request("validation-ids", "/catalog/v1/items", {
      stores: store.id,
      channel,
      retailBrand,
      ids,
      limit: ids.length,
      offset: 0,
    });
    console.log(`  validation ids=${ids.join(",")}: status=${validation.status} latency=${Math.round(validation.latencyMs)}ms count=${extractItems(validation.body).length}`);
  }
}

async function request(name, path, params) {
  const url = new URL(path, `${baseUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(key, String(item)));
    else if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  const started = performance.now();
  let status = 0;
  let body = null;
  let error = null;
  try {
    const response = await fetch(url);
    status = response.status;
    body = await response.json().catch(() => null);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }
  const latencyMs = performance.now() - started;
  await writeFile(join(outDir, `${Date.now()}-${name}.json`), JSON.stringify({ url: url.toString(), status, latencyMs, body, error }, null, 2));
  return { status, latencyMs, body, error };
}

function parsePoints(values) {
  const points = [];
  const lats = arrayArg(values.lat);
  const lons = arrayArg(values.lon || values.lng);
  for (let index = 0; index < Math.min(lats.length, lons.length); index += 1) {
    points.push({ lat: lats[index], lon: lons[index] });
  }
  return points;
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const value = argv[index + 1]?.startsWith("--") || argv[index + 1] === undefined ? "true" : argv[++index];
    values[key] = values[key] === undefined ? value : [].concat(values[key], value);
  }
  return values;
}

function arrayArg(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function extractItems(value) {
  if (Array.isArray(value)) return value;
  for (const key of ["items", "products", "results", "data"]) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  if (Array.isArray(value?.data?.items)) return value.data.items;
  return [];
}

function nearestStores(stores) {
  if (!Array.isArray(stores)) return [];
  return [...stores].sort((a, b) => Number(a?.distance ?? Number.MAX_SAFE_INTEGER) - Number(b?.distance ?? Number.MAX_SAFE_INTEGER));
}

function slug(value) {
  return String(value).toLocaleLowerCase("ru-RU").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "query";
}

function stripSlash(value) {
  return String(value).replace(/\/$/, "");
}
