import type { NormalizedProduct } from "../types/domain";

export interface LentaCatalogLog {
  stage: "search" | "validate";
  query?: string;
  count: number;
  products: Array<{
    xmlId: string;
    name: string;
    priceRub: number;
    priceObservedAt?: string;
    storeName?: string;
    storeId?: string;
  }>;
}

const lentaCatalogLogs: LentaCatalogLog[] = [];

export function recordLentaCatalogProducts(stage: LentaCatalogLog["stage"], products: NormalizedProduct[], query?: string) {
  const lentaProducts = products.filter((product) => product.retailer === "lenta");
  if (!lentaProducts.length) return;
  const entry = {
    stage,
    ...(query ? { query } : {}),
    count: lentaProducts.length,
    products: lentaProducts.map((product) => ({
      xmlId: product.xmlId,
      name: product.name,
      priceRub: product.priceRub,
      priceObservedAt: product.priceObservedAt,
      storeName: product.storeName,
      storeId: product.storeId,
    })),
  };
  lentaCatalogLogs.push(entry);
  lentaCatalogLogs.splice(0, Math.max(0, lentaCatalogLogs.length - 20));
  console.log("lenta_catalog_products", entry);
}

export function logCatalogProductsSummary(stage: "search" | "validate", products: NormalizedProduct[], query?: string) {
  const counts = products.reduce<Record<string, number>>((acc, product) => {
    const retailer = product.retailer || "unknown";
    acc[retailer] = (acc[retailer] || 0) + 1;
    return acc;
  }, {});
  console.log("catalog_products_summary", {
    stage,
    ...(query ? { query } : {}),
    total: products.length,
    counts,
  });
}

export function getLentaCatalogLogs() {
  return [...lentaCatalogLogs];
}
