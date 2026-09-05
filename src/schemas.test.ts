import { describe, expect, it } from "vitest";
import { basketDraftJsonSchema, basketDraftResponseSchema } from "./schemas";

describe("basket draft schemas", () => {
  it("accepts twelve Lavka-inclusive retailer variants", () => {
    const variants = (["vkusvill", "lenta", "pyaterochka", "lavka"] as const).flatMap((retailer) =>
      (["balanced", "budget", "speed"] as const).map((strategy) => ({
        retailer,
        strategy,
        items: [1, 2, 3, 4].map((id) => ({ xmlId: `${retailer}:${id}`, quantity: 1, role: "main", reasonCode: "requested_by_user" })),
      })),
    );

    expect(basketDraftResponseSchema.safeParse({ variants }).success).toBe(true);
    expect(basketDraftJsonSchema.properties.variants.maxItems).toBe(30);
    expect(basketDraftJsonSchema.properties.variants.items.properties.retailer.enum).toContain("lavka");
  });
  it("accepts the shared retailer set and long provider-scoped SKU identifiers", () => {
    const variants = ["magnit", "perekrestok", "metro", "auchan", "dixy"].flatMap(retailer =>
      ["balanced", "budget", "speed"].map(strategy => ({ retailer, strategy, items: [1, 2, 3, 4].map(i => ({ xmlId: `yandex_eats:${retailer}_${"a".repeat(70)}:sku-${i}`, quantity: 1, role: "main", reasonCode: "requested_by_user" })) })),
    );
    expect(basketDraftResponseSchema.safeParse({ variants }).success).toBe(true);
    expect(basketDraftJsonSchema.properties.variants.items.properties.retailer.enum).toContain("magnit");
  });
});
