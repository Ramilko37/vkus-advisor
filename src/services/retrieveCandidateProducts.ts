import type { BasketIntent, CatalogClient, NormalizedProduct } from "../types/domain";
import { MAX_RAW_CANDIDATES, MAX_SEARCH_QUERIES, MAX_SEARCH_RESULTS_PER_QUERY } from "./candidateSelection";
import { deduplicateSearchQueries } from "./intentUtils";

export async function retrieveCandidateProducts(
  intent: BasketIntent,
  catalog: CatalogClient,
  signal?: AbortSignal,
): Promise<NormalizedProduct[]> {
  const queries = deduplicateSearchQueries(intent.searchQueries).slice(0, MAX_SEARCH_QUERIES);
  const settled = await runLimited(queries, 3, (query) => catalog.searchProducts(query, signal));
  const products = settled.flatMap((result) => (result.status === "fulfilled" ? result.value.slice(0, MAX_SEARCH_RESULTS_PER_QUERY) : []));
  const deduped = dedupeProducts(products)
    .filter((product) => product.xmlId && product.name && product.priceRub > 0)
    .filter((product) => !matchesExclusions(product, intent.excludedIngredients))
    .slice(0, MAX_RAW_CANDIDATES);

  const needsDetails = intent.excludedIngredients.length > 0 || intent.preferences.some((item) => /белк|калор/i.test(item));
  if (!needsDetails) return deduped;

  const detailTargets = deduped.filter((product) => !product.composition).slice(0, 10);
  const details = await runLimited(detailTargets, 3, (product) => catalog.getProductDetails(product.id, signal));
  const detailMap = new Map<string, Partial<NormalizedProduct>>();
  details.forEach((result, index) => {
    if (result.status === "fulfilled") detailMap.set(detailTargets[index].xmlId, result.value);
  });

  return deduped
    .map((product) => {
      const details = detailMap.get(product.xmlId);
      return { ...details, ...product, composition: details?.composition ?? product.composition, calories: details?.calories ?? product.calories, proteins: details?.proteins ?? product.proteins };
    })
    .filter((product) => !matchesExclusions(product, intent.excludedIngredients));
}

async function runLimited<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;

  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        results[index] = { status: "fulfilled", value: await worker(items[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

function dedupeProducts(products: NormalizedProduct[]): NormalizedProduct[] {
  const map = new Map<string, NormalizedProduct>();
  for (const product of products) {
    const current = map.get(product.xmlId);
    if (!current || completeness(product) > completeness(current)) map.set(product.xmlId, product);
  }
  return Array.from(map.values());
}

function completeness(product: NormalizedProduct): number {
  return Object.values(product).filter((value) => value !== undefined && value !== "").length;
}

function matchesExclusions(product: NormalizedProduct, exclusions: string[]): boolean {
  const haystack = `${product.name} ${product.description ?? ""} ${product.composition ?? ""}`.toLocaleLowerCase("ru-RU");
  return exclusions.some((exclusion) => exclusion && haystack.includes(exclusion.toLocaleLowerCase("ru-RU")));
}
