import { describe, expect, it } from "vitest";
import { summarizeIntentSlots, validateBasketRequest } from "./requestCopy";
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
