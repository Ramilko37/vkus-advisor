import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PROFILE, loadGuestProfile, mergeGuestIntoRemote } from "./profileRepository";
import type { UserProfile } from "../types/domain";

const storageKey = "vkusvill-advisor:user-profile";

describe("profileRepository", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => store.clear(),
        getItem: (key: string) => store.get(key) ?? null,
        removeItem: (key: string) => store.delete(key),
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("saves and loads a normalized guest profile", () => {
    window.localStorage.setItem(storageKey, JSON.stringify({
      address: "  Москва, Тверская 1  ",
      lentaStoreId: " 525 ",
      lentaStoreName: " ТК1453 ",
      lentaStoreAddress: " Москва, Овчинниковская наб., 22/24с1 ",
      householdSize: 2,
      defaultDays: 5,
      defaultBudgetRub: 3000,
      excludedIngredients: [" грибы ", ""],
      preferences: ["быстро"],
    }));

    expect(loadGuestProfile()).toEqual({
      ...DEFAULT_PROFILE,
      address: "Москва, Тверская 1",
      lentaStoreId: "525",
      lentaStoreName: "ТК1453",
      lentaStoreAddress: "Москва, Овчинниковская наб., 22/24с1",
      householdSize: 2,
      excludedIngredients: ["грибы"],
      preferences: ["быстро"],
    });
  });

  it("does not overwrite a filled remote profile with guest data", () => {
    const remote: UserProfile = {
      ...DEFAULT_PROFILE,
      email: "user@example.com",
      address: "Казань, Баумана 1",
      householdSize: 3,
      excludedIngredients: ["орехи"],
      preferences: ["детское"],
    };
    const guest: UserProfile = { ...DEFAULT_PROFILE, address: "Москва", householdSize: 2 };

    expect(mergeGuestIntoRemote(guest, remote)).toEqual(remote);
  });

  it("moves guest fields into an empty remote profile", () => {
    const guest: UserProfile = {
      ...DEFAULT_PROFILE,
      address: "Москва",
      householdSize: 2,
      excludedIngredients: ["грибов"],
      preferences: ["без готовки"],
    };

    expect(mergeGuestIntoRemote(guest, { ...DEFAULT_PROFILE, userId: "user-1", email: "user@example.com" })).toEqual({
      ...guest,
      userId: "user-1",
      email: "user@example.com",
    });
  });

  it("falls back to defaults when guest storage is invalid", () => {
    window.localStorage.setItem(storageKey, "{bad json");

    expect(loadGuestProfile()).toEqual(DEFAULT_PROFILE);
  });
});
