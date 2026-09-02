import type { BasketValidationResult, CatalogClient, LentaStore, NormalizedProduct, Retailer, SearchQuery, UserProfile } from "../types/domain";
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
    const response = await fetchJson<{ mode: "live" | "demo"; products: NormalizedProduct[] }>("/api/catalog/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...query, address: this.profile.address.trim() || undefined, ...lentaStorePayload(this.profile) }),
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

export type DeliveryContextResult =
  | { status: "address_not_found" }
  | { status: "no_retailers"; address: string; retailers: [] }
  | { status: "ready"; address: string; retailers: Retailer[]; lentaStore?: LentaStore };

export async function resolveDeliveryContext(address: string, signal?: AbortSignal): Promise<DeliveryContextResult> {
  const [normalizedAddress] = await suggestAddresses(address, signal);
  if (!normalizedAddress) return { status: "address_not_found" };

  const [storesResult, availabilityResult] = await Promise.allSettled([
    findLentaStores(normalizedAddress, signal),
    fetchJson<CatalogAvailability>(`/api/catalog/status?address=${encodeURIComponent(normalizedAddress)}`, { method: "GET", signal }),
  ]);
  const stores = storesResult.status === "fulfilled" ? storesResult.value : [];
  const availability = availabilityResult.status === "fulfilled" ? availabilityResult.value : {};
  const lentaStore = stores[0];
  const retailers: Retailer[] = [];
  if (availability.providers?.vkusvill?.connected) retailers.push("vkusvill");
  if (lentaStore && availability.providers?.lenta?.enabled) retailers.push("lenta");
  if (availability.providers?.pyaterochka?.connected && availability.providers.pyaterochka.store === "resolved") retailers.push("pyaterochka");

  if (!retailers.length) return { status: "no_retailers", address: normalizedAddress, retailers: [] };
  return { status: "ready", address: normalizedAddress, retailers, ...(lentaStore ? { lentaStore } : {}) };
}

interface CatalogAvailability {
  providers?: {
    vkusvill?: { connected?: boolean };
    lenta?: { enabled?: boolean };
    pyaterochka?: { connected?: boolean; store?: string };
  };
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
