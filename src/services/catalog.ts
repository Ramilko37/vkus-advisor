import type { BasketValidationResult, CatalogClient, NormalizedProduct, SearchQuery, UserProfile } from "../types/domain";
import { logCatalogProductsSummary, recordLentaCatalogProducts } from "./catalogDebug";
import { DEFAULT_PROFILE } from "./profileRepository";

export class ApiCatalogClient implements CatalogClient {
  mode: "live" | "demo" = "demo";

  constructor(private readonly profile: UserProfile = DEFAULT_PROFILE) {}

  async connect(signal?: AbortSignal) {
    const response = await fetchJson<{ mode: "live" | "demo" }>("/api/catalog/status", { method: "GET", signal });
    this.mode = response.mode;
  }

  async searchProducts(query: SearchQuery, signal?: AbortSignal) {
    console.info("catalog_search_request", { query: query.query, hasAddress: Boolean(this.profile.address.trim()) });
    const response = await fetchJson<{ mode: "live" | "demo"; products: NormalizedProduct[] }>("/api/catalog/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...query, address: this.profile.address.trim() || undefined }),
      signal,
    });
    this.mode = response.mode;
    logCatalogProductsSummary("search", response.products, query.query);
    recordLentaCatalogProducts("search", response.products, query.query);
    return response.products;
  }

  async getProductDetails(productId: string, signal?: AbortSignal) {
    return fetchJson<Partial<NormalizedProduct>>(`/api/catalog/details?id=${encodeURIComponent(productId)}`, { method: "GET", signal });
  }

  async validateBasketItems(items: Array<{ xmlId: string; quantity: number; priceRub?: number }>, signal?: AbortSignal) {
    const response = await fetchJson<BasketValidationResult>("/api/catalog/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, address: this.profile.address.trim() || undefined }),
      signal,
    });
    logCatalogProductsSummary("validate", response.products);
    recordLentaCatalogProducts("validate", response.products);
    return response;
  }

  async createCartLink(items: Array<{ xmlId: string; quantity: number }>, signal?: AbortSignal) {
    const response = await fetchJson<{ url: string }>("/api/catalog/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
      signal,
    });
    return response.url;
  }
}

export async function createCatalogClient(profile: UserProfile = DEFAULT_PROFILE, signal?: AbortSignal): Promise<CatalogClient> {
  const client = new ApiCatalogClient(profile);
  await client.connect(signal);
  return client;
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`API request failed: ${response.status}`);
  return response.json() as Promise<T>;
}
