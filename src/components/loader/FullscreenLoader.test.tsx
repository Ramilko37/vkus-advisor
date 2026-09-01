import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FullscreenLoader } from "./FullscreenLoader";

describe("FullscreenLoader", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockReducedMotion(false);
    mockVisibility("visible");
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("keeps the existing pipeline information and bounds active falling sprites", () => {
    render(<FullscreenLoader stage="searching" intent={null} onCancel={vi.fn()} />);

    expect(screen.getByText("Подбираем корзину")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отменить" })).toBeInTheDocument();
    expect(screen.getByLabelText("Падающие продукты")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(20_000));
    const falling = document.querySelectorAll("[data-flight]");
    expect(falling.length).toBeGreaterThan(0);
    expect(falling.length).toBeLessThanOrEqual(8);
  });

  it("keeps the basket scene before the bottom progress panel", () => {
    render(<FullscreenLoader stage="searching" intent={null} onCancel={vi.fn()} />);

    const basket = document.querySelector(".pixel-basket");
    const progress = screen.getByRole("region", { name: "Прогресс подбора" });

    expect(basket).not.toBeNull();
    expect(basket!.compareDocumentPosition(progress) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows a static basket without food rain for reduced motion", () => {
    mockReducedMotion(true);
    render(<FullscreenLoader stage="searching" intent={null} onCancel={vi.fn()} />);

    expect(screen.queryByLabelText("Падающие продукты")).not.toBeInTheDocument();
    expect(document.querySelector(".pixel-basket")).toBeInTheDocument();
    expect(document.querySelectorAll(".pixel-basket__item")).toHaveLength(7);
  });

  it("pauses spawning in a background tab and resumes when it becomes visible", () => {
    mockVisibility("hidden");
    render(<FullscreenLoader stage="searching" intent={null} onCancel={vi.fn()} />);

    act(() => vi.advanceTimersByTime(4_000));
    expect(document.querySelectorAll("[data-flight]")).toHaveLength(0);

    mockVisibility("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(800);
    });
    expect(document.querySelectorAll("[data-flight]").length).toBeGreaterThan(0);
  });

  it("fills all slots and hides cancel only during the real finish sequence", () => {
    render(<FullscreenLoader stage="ready" intent={null} finishing onCancel={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Отменить" })).not.toBeInTheDocument();
    expect(screen.getByText("Корзины готовы")).toBeInTheDocument();
    expect(document.querySelector(".pixel-basket-mark--success")).not.toBeNull();
    act(() => vi.advanceTimersByTime(520));
    expect(document.querySelectorAll(".pixel-basket__item")).toHaveLength(12);
  });
});

function mockReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
}

function mockVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, value });
}
