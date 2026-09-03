import { describe, expect, it } from "vitest";
import { buildRetailerOptions } from "./retailerPresentation";
import type { BasketVariant, RetailerResult } from "../types/domain";

function variant(retailer: NonNullable<BasketVariant["retailer"]>, strategy: BasketVariant["strategy"], totalRub: number): BasketVariant {
  return {
    id: `${retailer}:${strategy}`,
    retailer,
    strategy,
    title: strategy,
    summary: "",
    tradeoffs: [],
    items: [],
    totalRub,
    uniqueItemsCount: 0,
    warnings: [],
  };
}

function result(retailer: RetailerResult["retailer"], status: RetailerResult["status"], variantCount: number): RetailerResult {
  return { retailer, status, candidateCount: variantCount, selectedCandidateCount: variantCount, variantCount };
}

describe("buildRetailerOptions", () => {
  it("sorts available retailers by their lowest basket price", () => {
    const variants = [
      variant("vkusvill", "balanced", 3120),
      variant("vkusvill", "budget", 2950),
      variant("vkusvill", "speed", 3450),
      variant("lenta", "balanced", 2860),
      variant("lenta", "budget", 2740),
      variant("lenta", "speed", 3180),
    ];

    const options = buildRetailerOptions(variants, [
      result("vkusvill", "ready", 3),
      result("lenta", "ready", 3),
      result("pyaterochka", "no_candidates", 0),
    ]);

    expect(options.map((option) => option.key)).toEqual(["lenta", "vkusvill"]);
    expect(options[0]).toEqual(expect.objectContaining({
      minPriceRub: 2740,
      capabilityLabel: "Список",
    }));
  });

  it("does not expose failed or zero-variant retailer groups as selectable options", () => {
    const options = buildRetailerOptions(
      [variant("vkusvill", "balanced", 3000)],
      [
        result("vkusvill", "ready", 1),
        result("lenta", "failed", 0),
        result("pyaterochka", "no_candidates", 0),
      ],
    );

    expect(options.map((option) => option.key)).toEqual(["vkusvill"]);
  });
});
