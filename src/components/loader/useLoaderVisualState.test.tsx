import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowStage } from "../../types/domain";
import { useLoaderVisualState } from "./useLoaderVisualState";

type LoaderProps = { stage: WorkflowStage; hasResults: boolean };

describe("useLoaderVisualState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockReducedMotion(false);
  });

  afterEach(() => vi.useRealTimers());

  it("keeps the loader for a short finish sequence after real results are ready", () => {
    const { result, rerender } = renderHook(
      ({ stage, hasResults }: LoaderProps) => useLoaderVisualState(stage, hasResults),
      { initialProps: { stage: "composing", hasResults: false } as LoaderProps },
    );

    rerender({ stage: "ready", hasResults: true });
    expect(result.current).toEqual({ visible: true, finishing: true });

    act(() => vi.advanceTimersByTime(699));
    expect(result.current.visible).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.visible).toBe(false);
  });

  it("adds no finish delay when reduced motion is requested", () => {
    mockReducedMotion(true);
    const { result, rerender } = renderHook(
      ({ stage, hasResults }: LoaderProps) => useLoaderVisualState(stage, hasResults),
      { initialProps: { stage: "searching", hasResults: false } as LoaderProps },
    );

    rerender({ stage: "ready", hasResults: true });
    expect(result.current).toEqual({ visible: false, finishing: false });
  });
});

function mockReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
}
