import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ONBOARDING_STORAGE_KEY } from "../services/onboardingRepository";
import { useOnboarding } from "./useOnboarding";

describe("useOnboarding", () => {
  afterEach(() => window.localStorage.clear());

  it("moves through steps, goes back, and persists the request draft", () => {
    const { result } = renderHook(() => useOnboarding({ ready: true }));

    act(() => result.current.start());
    expect(result.current.state.step).toBe("delivery");

    act(() => result.current.goTo("profile"));
    act(() => result.current.setRequestDraft("ужины на три дня"));
    act(() => result.current.back());

    expect(result.current.state.step).toBe("delivery");
    expect(JSON.parse(window.localStorage.getItem(ONBOARDING_STORAGE_KEY) || "{}")).toEqual(expect.objectContaining({
      step: "delivery",
      requestDraft: "ужины на три дня",
    }));
  });

  it("dismisses onboarding and can reopen the required delivery step", () => {
    const { result } = renderHook(() => useOnboarding({ ready: true }));

    act(() => result.current.dismiss());
    expect(result.current.state.status).toBe("dismissed");

    act(() => result.current.open("delivery", "ужины до 3000 ₽"));
    expect(result.current.state).toEqual(expect.objectContaining({
      status: "in_progress",
      step: "delivery",
      requestDraft: "ужины до 3000 ₽",
    }));
  });

  it("completes after profile setup and dismisses each contextual hint once", () => {
    const { result } = renderHook(() => useOnboarding({ ready: true }));

    act(() => result.current.complete());
    expect(result.current.state.status).toBe("completed");
    expect(result.current.state.step).toBe("profile");
    expect(result.current.state.completedAt).toEqual(expect.any(String));
    expect(result.current.showResultsHint).toBe(true);

    act(() => result.current.dismissResultsHint());
    act(() => result.current.dismissBasketEditHint());
    expect(result.current.showResultsHint).toBe(false);
    expect(result.current.showBasketEditHint).toBe(false);
  });
});
