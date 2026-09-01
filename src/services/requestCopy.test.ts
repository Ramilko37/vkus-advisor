import { describe, expect, it } from "vitest";
import { summarizeIntentLine, summarizeIntentSlots, summarizeIntentTitle, validateBasketRequest } from "./requestCopy";
import type { BasketIntent } from "../types/domain";

describe("request copy", () => {
  it("rejects a prompt that is too short to form a basket task", () => {
    expect(validateBasketRequest("ужин")).toBe("Добавьте детали: срок, людей, бюджет или ограничения.");
  });

  it("accepts a prompt with enough basket context", () => {
    expect(validateBasketRequest("ужины на 3 дня для двоих")).toBeNull();
  });

  it("echoes extracted slots before catalog search", () => {
    expect(summarizeIntentSlots(intent)).toEqual(["2 чел.", "3 дня", "до 3 000 ₽", "без грибов", "ужин"]);
  });

  it("summarizes the resolved request for the results screen", () => {
    expect(summarizeIntentTitle(intent)).toBe("Ужины на 3 дня");
    expect(summarizeIntentLine(intent)).toBe("2 человека · до 3 000 ₽ · без грибов");
  });

  it("uses a generic basket title for multiple meals", () => {
    expect(summarizeIntentTitle({ ...intent, meals: ["завтрак", "ужин"] })).toBe("Корзина на 3 дня");
  });
});

const intent: BasketIntent = {
  originalRequest: "ужины на 3 дня",
  people: 2,
  days: 3,
  meals: ["ужин"],
  budgetRub: 3000,
  maxCookingMinutes: null,
  excludedIngredients: ["грибов"],
  preferences: [],
  readyFoodAllowed: true,
  priority: "balanced",
  needsClarification: false,
  clarificationQuestion: null,
  assumptions: [],
  searchQueries: [],
};
