import type { BasketIntent, CatalogClient, NormalizedProduct } from "../types/domain";
import { MAX_RAW_CANDIDATES, MAX_SEARCH_QUERIES, MAX_SEARCH_RESULTS_PER_QUERY } from "./candidateSelection";
import { deduplicateSearchQueries } from "./intentUtils";
import { productMatchesTerms } from "./basketValidation";

export async function retrieveCandidateProducts(
  intent: BasketIntent,
  catalog: CatalogClient,
  signal?: AbortSignal,
): Promise<NormalizedProduct[]> {
  const queries = deduplicateSearchQueries(intent.searchQueries).slice(0, MAX_SEARCH_QUERIES);
  const settled = await runLimited(queries, 3, (query) => catalog.searchProducts(query, signal));
  const products = settled.flatMap((result) => (result.status === "fulfilled" ? capPerRetailer(result.value, MAX_SEARCH_RESULTS_PER_QUERY) : []));
  const validProducts = dedupeProducts(products)
    .filter((product) => product.xmlId && product.name && product.priceRub > 0)
    .filter((product) => !matchesExclusions(product, intent.excludedIngredients));
  const deduped = capRawCandidates(validProducts, MAX_RAW_CANDIDATES, MAX_SEARCH_RESULTS_PER_QUERY);

  const needsDetails = deduped.some((product) => !product.imageUrl)
    || intent.excludedIngredients.length > 0
    || intent.dietaryRestrictions.length > 0
    || intent.preferences.some((item) => /белк|калор/i.test(item));
  if (!needsDetails) return deduped;

  const hasHardRestrictions = intent.excludedIngredients.length > 0 || intent.dietaryRestrictions.length > 0;
  const detailTargets = deduped
    .filter((product) => !product.imageUrl || !product.composition)
    .slice(0, hasHardRestrictions ? deduped.length : 10);
  const details = await runLimited(detailTargets, 3, (product) => catalog.getProductDetails(product.id, signal));
  const detailMap = new Map<string, Partial<NormalizedProduct>>();
  details.forEach((result, index) => {
    if (result.status === "fulfilled") detailMap.set(detailTargets[index].xmlId, result.value);
  });

  return deduped
    .map((product) => {
      const details = detailMap.get(product.xmlId);
      return mergeProductDetails(product, details);
    })
    .filter((product) => !matchesExclusions(product, intent.excludedIngredients));
}

function mergeProductDetails(product: NormalizedProduct, details: Partial<NormalizedProduct> | undefined): NormalizedProduct {
  if (!details) return product;
  return {
    ...product,
    weightLabel: product.weightLabel ?? details.weightLabel,
    imageUrl: product.imageUrl ?? details.imageUrl,
    productUrl: product.productUrl ?? details.productUrl,
    description: details.description ?? product.description,
    composition: details.composition ?? product.composition,
    calories: details.calories ?? product.calories,
    proteins: details.proteins ?? product.proteins,
    fats: details.fats ?? product.fats,
    carbohydrates: details.carbohydrates ?? product.carbohydrates,
  };
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

function capPerRetailer(products: NormalizedProduct[], limit: number): NormalizedProduct[] {
  const counts = new Map<string, number>();
  return products.filter((product) => {
    const key = product.retailer || "demo";
    const count = counts.get(key) || 0;
    if (count >= limit) return false;
    counts.set(key, count + 1);
    return true;
  });
}

function capRawCandidates(products: NormalizedProduct[], limit: number, retailerQuota: number): NormalizedProduct[] {
  const selected: NormalizedProduct[] = [];
  const used = new Set<string>();
  const counts = new Map<string, number>();
  for (const product of products) {
    const key = product.retailer || "demo";
    const count = counts.get(key) || 0;
    if (count >= retailerQuota) continue;
    selected.push(product);
    used.add(product.xmlId);
    counts.set(key, count + 1);
  }
  for (const product of products) {
    if (selected.length >= limit) break;
    if (used.has(product.xmlId)) continue;
    selected.push(product);
  }
  return selected.slice(0, limit);
}

function completeness(product: NormalizedProduct): number {
  return Object.values(product).filter((value) => value !== undefined && value !== "").length;
}

function matchesExclusions(product: NormalizedProduct, exclusions: string[]): boolean {
  return productMatchesTerms(product, exclusions);
}
