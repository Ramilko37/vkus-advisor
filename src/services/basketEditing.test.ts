import { describe, expect, it } from "vitest";
import { replaceBasketItem } from "./basketEditing";
import type { BasketItem, NormalizedProduct } from "../types/domain";

describe("basket editing", () => {
  it("replaces an item with an unused product while preserving quantity and role copy", () => {
    const items = [basketItem("1", "Курица", 2), basketItem("2", "Гречка", 1)];
    const products = [product("2", "Гречка"), product("3", "Индейка")];

    const result = replaceBasketItem(items, products, "1");

    expect(result.map((item) => [item.xmlId, item.name, item.quantity, item.role])).toEqual([
      ["3", "Индейка", 2, "Белок"],
      ["2", "Гречка", 1, "Белок"],
    ]);
  });

  it("keeps the basket unchanged when no replacement is available", () => {
    const items = [basketItem("1", "Курица", 1)];

    expect(replaceBasketItem(items, [product("1", "Курица")], "1")).toBe(items);
  });
  it("cannot replace a direct SKU with a candidate-only SKU of the same retailer", () => {
    const item = { ...basketItem("lenta:1", "Молоко", 1), retailer: "lenta" as const, catalogProvider: "lenta_direct" as const };
    const candidate = { ...product("yandex_eats:lenta_test:2", "Молоко"), retailer: "lenta" as const, catalogProvider: "yandex_eats" as const, retailerPlaceSlug: "lenta_test" };
    const items = [item];
    expect(replaceBasketItem(items, [candidate], item.xmlId)).toBe(items);
  });
  it("can edit an unverified preview only within the same provider and place", () => {
    const item = { ...basketItem("yandex_eats:magnit_one:1", "Молоко", 1), retailer: "magnit" as const, catalogProvider: "yandex_eats" as const, retailerPlaceSlug: "magnit_one" };
    const otherPlace = { ...item, xmlId: "yandex_eats:magnit_two:2", retailerPlaceSlug: "magnit_two" };
    const replacement = { ...item, xmlId: "yandex_eats:magnit_one:3" };
    expect(replaceBasketItem([item], [otherPlace, replacement], item.xmlId)[0].xmlId).toBe(replacement.xmlId);
  });
});

function basketItem(xmlId: string, name: string, quantity: number): BasketItem {
  return {
    ...product(xmlId, name),
    quantity,
    role: "Белок",
    reason: "Подходит",
  };
}

function product(xmlId: string, name: string): NormalizedProduct {
  return {
    id: xmlId,
    xmlId,
    name,
    priceRub: 100,
    sourceQuery: "белок",
    isDemo: false,
  };
}
