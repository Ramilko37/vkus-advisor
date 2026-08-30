import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalogProviderStatus } from "./catalogProviderStatus.mjs";

describe("server catalog status", () => {
  const originalLentaEnabled = process.env.LENTA_ENABLED;

  afterEach(() => {
    if (originalLentaEnabled === undefined) {
      delete process.env.LENTA_ENABLED;
    } else {
      process.env.LENTA_ENABLED = originalLentaEnabled;
    }
    vi.resetModules();
  });

  it("reports retailer provider readiness and enables Lenta by default", async () => {
    delete process.env.LENTA_ENABLED;

    expect(createCatalogProviderStatus({
      env: process.env,
      catalogMode: "live",
      lentaStoreResolved: false,
      pyaterochkaConnected: false,
      pyaterochkaStoreState: "missing",
    })).toMatchObject({
      lentaEnabled: true,
      providers: {
        vkusvill: { configured: true },
        lenta: { enabled: true },
        pyaterochka: { configured: false },
      },
    });
  });
});
