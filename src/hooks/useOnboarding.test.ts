import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ONBOARDING_STORAGE_KEY } from "../services/onboardingRepository";
import { useOnboarding } from "./useOnboarding";

describe("useOnboarding", () => {
  afterEach(() => window.localStorage.clear());

  it("finishes the optional intro without opening delivery", () => {
    const { result } = renderHook(() => useOnboarding({ ready: true }));

    act(() => result.current.finishIntro());

    expect(result.current.visible).toBe(false);
    expect(result.current.state).toEqual(expect.objectContaining({
      version: 2,
      status: "completed",
      step: "value",
    }));
  });

  it("opens deferred delivery and preserves the request draft", () => {
    const { result } = renderHook(() => useOnboarding({ ready: true }));

    act(() => result.current.finishIntro());
    act(() => result.current.openDelivery("ужины до 3000 ₽"));

    expect(result.current.visible).toBe(true);
    expect(result.current.state).toEqual(expect.objectContaining({
      status: "in_progress",
      step: "delivery",
      requestDraft: "ужины до 3000 ₽",
    }));
    expect(JSON.parse(window.localStorage.getItem(ONBOARDING_STORAGE_KEY) || "{}")).toEqual(expect.objectContaining({
      requestDraft: "ужины до 3000 ₽",
    }));
  });

  it("keeps the current Home draft when delivery is opened from the topbar", () => {
    const { result } = renderHook(() => useOnboarding({ ready: true }));

    act(() => result.current.finishIntro());
    act(() => result.current.setRequestDraft("ужины для двоих без грибов"));
    act(() => result.current.openDelivery());

    expect(result.current.state).toEqual(expect.objectContaining({
      status: "in_progress",
      step: "delivery",
      requestDraft: "ужины для двоих без грибов",
    }));
  });

  it("completes delivery and clears the submitted request", () => {
    const { result } = renderHook(() => useOnboarding({ ready: true }));

    act(() => result.current.openDelivery("ужины на три дня"));
    act(() => result.current.completeDelivery());

    expect(result.current.visible).toBe(false);
    expect(result.current.state).toEqual(expect.objectContaining({
      status: "completed",
      step: "value",
      requestDraft: "",
    }));
  });

  it("replays only the value explanation", () => {
    const { result } = renderHook(() => useOnboarding({ ready: true }));

    act(() => result.current.finishIntro());
    act(() => result.current.replay());

    expect(result.current.visible).toBe(true);
    expect(result.current.state.step).toBe("value");
  });
});
