import { getLentaCatalogLogs, logCatalogProductsSummary, recordLentaCatalogProducts } from "./catalogDebug";
import type { NormalizedProduct } from "../types/domain";

type ModelContext = {
  registerTool: (tool: {
    name: string;
    title?: string;
    description: string;
    inputSchema: object;
    annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
    execute: (input: unknown) => unknown | Promise<unknown>;
  }, options?: { signal?: AbortSignal }) => void | Promise<void>;
};

export function registerWebMcpTools(signal?: AbortSignal) {
  const modelContext = (document as Document & { modelContext?: ModelContext }).modelContext;
  if (!modelContext?.registerTool) return;
  void Promise.resolve(modelContext.registerTool({
    name: "get_lenta_catalog_products",
    title: "Get Lenta catalog products",
    description: "Return recent Lenta products observed by the browser catalog client.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute() {
      return { logs: getLentaCatalogLogs() };
    },
  }, { signal })).catch((error) => {
    if (error instanceof DOMException && error.name === "AbortError") return;
    console.warn("webmcp_registration_failed", error);
  });
  void Promise.resolve(modelContext.registerTool({
    name: "debug_search_lenta_catalog",
    title: "Debug Lenta catalog search",
    description: "Run a local catalog search and return the Lenta products observed by the browser catalog client.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        address: { type: "string" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    async execute(input) {
      const { query, address } = parseDebugSearchInput(input);
      const response = await fetch("/api/catalog/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, purpose: "debug", sort: "popularity", ...(address ? { address } : {}) }),
      });
      if (!response.ok) throw new Error(`Catalog search failed: ${response.status}`);
      const payload = await response.json() as { mode: "live" | "demo"; products: NormalizedProduct[] };
      logCatalogProductsSummary("search", payload.products, query);
      recordLentaCatalogProducts("search", payload.products, query);
      const lentaProducts = payload.products.filter((product) => product.retailer === "lenta");
      return {
        mode: payload.mode,
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
    },
  }, { signal })).catch((error) => {
    if (error instanceof DOMException && error.name === "AbortError") return;
    console.warn("webmcp_registration_failed", error);
  });
}

function parseDebugSearchInput(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("query is required");
  const value = input as { query?: unknown; address?: unknown };
  const query = typeof value.query === "string" ? value.query.trim() : "";
  const address = typeof value.address === "string" ? value.address.trim() : "";
  if (!query) throw new Error("query is required");
  return { query, address };
}
