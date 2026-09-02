// @vitest-environment node

import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";

describe("Vercel catalog routes", () => {
  it("exposes the Lenta store and basket validation endpoints", async () => {
    const storesRoute = await import("../../api/catalog/lenta/stores.mjs").catch(() => null);
    const validateRoute = await import("../../api/catalog/validate.mjs").catch(() => null);

    expect(storesRoute?.default).toBeTypeOf("function");
    expect(validateRoute?.default).toBeTypeOf("function");
    await expect(post(storesRoute.default, "/api/catalog/lenta/stores", {})).resolves.toEqual({
      status: 400,
      body: { error: "Delivery address is required" },
    });
    await expect(post(validateRoute.default, "/api/catalog/validate", { items: [] })).resolves.toEqual({
      status: 200,
      body: { products: [], unavailableXmlIds: [], changedPrices: [] },
    });
  });

  it("does not fall back to an unverified retailer catalog", async () => {
    const searchRoute = await import("../../api/catalog/search.mjs");

    await expect(post(searchRoute.default, "/api/catalog/search", {
      query: "молоко",
      retailers: [],
    })).resolves.toEqual({
      status: 200,
      body: { mode: "live", products: [] },
    });
  });
});

async function post(handler, url, body) {
  const req = Readable.from([JSON.stringify(body)]);
  Object.assign(req, { url, method: "POST", headers: { host: "localhost" } });
  let status = 0;
  let text = "";
  const res = {
    writeHead(nextStatus) { status = nextStatus; },
    end(chunk) { text = String(chunk || ""); },
  };
  await handler(req, res);
  return { status, body: JSON.parse(text) };
}
