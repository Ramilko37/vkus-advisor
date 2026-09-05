import type { BasketValidationResult, CatalogClient, CatalogValidationItem, LentaStore, NormalizedProduct, SearchQuery, UserProfile } from "../types/domain";
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
    console.info("catalog_search_request", { query: query.query, hasAddress: Boolean(this.profile.address.trim()), lentaStoreId: this.profile.lentaStoreId });
    const response = await fetchJson<{ mode: "live" | "demo"; products: NormalizedProduct[]; candidateProducts?: NormalizedProduct[] }>("/api/catalog/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...query, address: this.profile.address.trim() || undefined, ...lentaStorePayload(this.profile) }),
      signal,
    });
    this.mode = response.mode;
    logCatalogProductsSummary("search", response.products, query.query);
    recordLentaCatalogProducts("search", response.products, query.query);
    // Candidate-only sources travel through normalization/selection, which excludes them from final baskets.
    return [...response.products, ...(response.candidateProducts ?? [])];
  }

  async getProductDetails(productId: string, signal?: AbortSignal) {
    return fetchJson<Partial<NormalizedProduct>>(`/api/catalog/details?id=${encodeURIComponent(productId)}&address=${encodeURIComponent(this.profile.address.trim())}`, { method: "GET", signal });
  }

  async validateBasketItems(items: CatalogValidationItem[], signal?: AbortSignal) {
    const response = await fetchJson<BasketValidationResult>("/api/catalog/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, address: this.profile.address.trim() || undefined, ...lentaStorePayload(this.profile) }),
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

export async function findLentaStores(address: string, signal?: AbortSignal): Promise<LentaStore[]> {
  const response = await fetchJson<{ stores: LentaStore[] }>("/api/catalog/lenta/stores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: address.trim() }),
    signal,
  });
  return response.stores;
}

export async function suggestAddresses(query: string, signal?: AbortSignal): Promise<string[]> {
  const response = await fetchJson<{ suggestions: string[] }>("/api/address/suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal,
  });
  return response.suggestions;
}

export async function reverseGeocodeAddress(lat: number, lon: number, signal?: AbortSignal): Promise<string[]> {
  const response = await fetchJson<{ suggestions: string[] }>("/api/address/geolocate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lon }),
    signal,
  });
  return response.suggestions;
}

function lentaStorePayload(profile: UserProfile) {
  return {
    lentaStoreId: /^ТК(\d+)$/i.exec(profile.lentaStoreName?.trim() || "")?.[1] || profile.lentaStoreId,
    lentaStoreName: profile.lentaStoreName,
    lentaStoreAddress: profile.lentaStoreAddress,
  };
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`API request failed: ${response.status}`);
  return response.json() as Promise<T>;
}
