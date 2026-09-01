import { afterEach, describe, expect, it } from "vitest";
import {
  ONBOARDING_STORAGE_KEY,
  createInitialOnboardingState,
  loadOnboardingState,
  saveOnboardingState,
} from "./onboardingRepository";

describe("onboardingRepository", () => {
  afterEach(() => window.localStorage.clear());

  it("starts every first visit at the optional value step", () => {
    expect(createInitialOnboardingState()).toEqual({
      version: 2,
      status: "not_started",
      step: "value",
      requestDraft: "",
      resultsHintDismissed: false,
      basketEditHintDismissed: false,
    });
  });

  it("resumes a valid deferred delivery step and request", () => {
    saveOnboardingState({
      ...createInitialOnboardingState(),
      status: "in_progress",
      step: "delivery",
      requestDraft: "ужины на три дня",
    });

    expect(loadOnboardingState()).toEqual(expect.objectContaining({
      version: 2,
      status: "in_progress",
      step: "delivery",
      requestDraft: "ужины на три дня",
    }));
  });

  it("migrates the removed profile step without reopening onboarding", () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({
      version: 1,
      status: "in_progress",
      step: "profile",
      requestDraft: "",
      resultsHintDismissed: false,
      basketEditHintDismissed: false,
    }));

    expect(loadOnboardingState()).toEqual(expect.objectContaining({
      version: 2,
      status: "completed",
      step: "value",
    }));
  });

  it("migrates a saved v1 delivery request", () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({
      version: 1,
      status: "in_progress",
      step: "delivery",
      requestDraft: "ужины до 3000 ₽",
      resultsHintDismissed: true,
      basketEditHintDismissed: false,
    }));

    expect(loadOnboardingState()).toEqual(expect.objectContaining({
      version: 2,
      status: "in_progress",
      step: "delivery",
      requestDraft: "ужины до 3000 ₽",
      resultsHintDismissed: true,
    }));
  });

  it("falls back safely when storage is malformed", () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "{broken");
    expect(loadOnboardingState()).toEqual(createInitialOnboardingState());
  });
});
