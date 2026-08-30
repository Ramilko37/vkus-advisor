import { afterEach, describe, expect, it } from "vitest";
import {
  ONBOARDING_STORAGE_KEY,
  createInitialOnboardingState,
  loadOnboardingState,
  saveOnboardingState,
} from "./onboardingRepository";

describe("onboardingRepository", () => {
  afterEach(() => window.localStorage.clear());

  it("starts every first visit at the value step", () => {
    expect(createInitialOnboardingState()).toEqual({
      version: 1,
      status: "not_started",
      step: "value",
      requestDraft: "",
      resultsHintDismissed: false,
      basketEditHintDismissed: false,
    });
  });

  it("starts at the value step when no state exists", () => {
    expect(loadOnboardingState()).toEqual(expect.objectContaining({
      status: "not_started",
      step: "value",
      resultsHintDismissed: false,
      basketEditHintDismissed: false,
    }));
  });

  it("resumes a valid saved step and request", () => {
    saveOnboardingState({
      ...createInitialOnboardingState(),
      status: "in_progress",
      step: "profile",
      requestDraft: "ужины на три дня",
    });

    expect(loadOnboardingState()).toEqual(expect.objectContaining({
      status: "in_progress",
      step: "profile",
      requestDraft: "ужины на три дня",
    }));
  });

  it("closes a legacy persisted request step instead of showing the removed screen", () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({
      ...createInitialOnboardingState(),
      status: "in_progress",
      step: "request",
    }));

    expect(loadOnboardingState()).toEqual(expect.objectContaining({
      status: "completed",
      step: "profile",
    }));
  });

  it("falls back safely when storage is malformed", () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "{broken");

    expect(loadOnboardingState()).toEqual(createInitialOnboardingState());
  });
});
