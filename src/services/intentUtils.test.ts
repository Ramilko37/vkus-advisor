import { describe, expect, it } from "vitest";
import { applyFastIntentPatch, buildCatalogFingerprint, deduplicateSearchQueries } from "./intentUtils";
import type { BasketIntent } from "../types/domain";

const intent: BasketIntent = {
  originalRequest: "ужины",
  people: 2,
  days: 5,
  meals: ["ужин", "завтрак"],
  budgetRub: 5000,
  maxCookingMinutes: 30,
  excludedIngredients: [],
  preferences: [],
  readyFoodAllowed: true,
  priority: "balanced",
  needsClarification: false,
  clarificationQuestion: null,
  assumptions: [],
  searchQueries: [
    { query: "Курица", purpose: "белок", sort: "popularity" },
    { query: " курица!!! ", purpose: "белок", sort: "price_asc" },
    { query: "гречка", purpose: "гарнир", sort: "popularity" },
    { query: "овощи", purpose: "овощи", sort: "popularity" },
    { query: "готовая еда", purpose: "быстро", sort: "rating" },
    { query: "перекус", purpose: "перекус", sort: "popularity" },
  ],
};

describe("intent utils", () => {
  it("deduplicates search queries and caps them at five", () => {
    const result = deduplicateSearchQueries(intent.searchQueries).slice(0, 5);
    expect(result.map((query) => query.query)).toEqual(["курица", "гречка", "овощи", "готовая еда", "перекус"]);
  });

  it("keeps fingerprint stable for budget changes and changes for restrictions", () => {
    expect(buildCatalogFingerprint(intent)).toBe(buildCatalogFingerprint({ ...intent, budgetRub: 1000, priority: "budget" }));
    expect(buildCatalogFingerprint(intent)).not.toBe(buildCatalogFingerprint({ ...intent, excludedIngredients: ["молоко"] }));
  });

  it("changes catalog fingerprint when delivery address changes", () => {
    expect(buildCatalogFingerprint(intent, "Москва, Тверская 1")).not.toBe(buildCatalogFingerprint(intent, "Москва, Вавилова 19"));
  });

  it("patches simple cheaper follow-up without resetting intent", () => {
    const patched = applyFastIntentPatch("Сделай дешевле.", intent);
    expect(patched).toMatchObject({ priority: "budget", people: 2, days: 5, meals: ["ужин", "завтрак"] });
  });

  it("ignores unknown follow-up text", () => {
    expect(applyFastIntentPatch("Добавь что-нибудь интересное", intent)).toBeNull();
  });
});
