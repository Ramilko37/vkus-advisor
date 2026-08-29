import type { CatalogClient, NormalizedProduct, SearchQuery, UserProfile } from "../types/domain";
import { DEFAULT_PROFILE } from "./profileRepository";

export class ApiCatalogClient implements CatalogClient {
  mode: "live" | "demo" = "demo";

  constructor(private readonly profile: UserProfile = DEFAULT_PROFILE) {}

  async connect(signal?: AbortSignal) {
    const response = await fetchJson<{ mode: "live" | "demo" }>("/api/catalog/status", { method: "GET", signal });
    this.mode = response.mode;
  }

  async searchProducts(query: SearchQuery, signal?: AbortSignal) {
    const response = await fetchJson<{ mode: "live" | "demo"; products: NormalizedProduct[] }>("/api/catalog/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...query, address: this.profile.address.trim() || undefined }),
      signal,
    });
    this.mode = response.mode;
    return response.products;
  }

  async getProductDetails(productId: string, signal?: AbortSignal) {
    return fetchJson<Partial<NormalizedProduct>>(`/api/catalog/details?id=${encodeURIComponent(productId)}`, { method: "GET", signal });
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
