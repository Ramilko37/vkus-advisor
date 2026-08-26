import type { CatalogClient, NormalizedProduct, SearchQuery } from "../types/domain";

export class ApiCatalogClient implements CatalogClient {
  mode: "live" | "demo" = "demo";

  async connect(signal?: AbortSignal) {
    const response = await fetchJson<{ mode: "live" | "demo" }>("/api/catalog/status", { method: "GET", signal });
    this.mode = response.mode;
  }

  async searchProducts(query: SearchQuery) {
    const response = await fetchJson<{ mode: "live" | "demo"; products: NormalizedProduct[] }>("/api/catalog/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
    });
    this.mode = response.mode;
    return response.products;
  }

  async getProductDetails(productId: string) {
    return fetchJson<Partial<NormalizedProduct>>(`/api/catalog/details?id=${encodeURIComponent(productId)}`, { method: "GET" });
  }

  async createCartLink(items: Array<{ xmlId: string; quantity: number }>) {
    const response = await fetchJson<{ url: string }>("/api/catalog/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    return response.url;
  }
}

export async function createCatalogClient(signal?: AbortSignal): Promise<CatalogClient> {
  const client = new ApiCatalogClient();
  await client.connect(signal);
  return client;
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`API request failed: ${response.status}`);
  return response.json() as Promise<T>;
}
