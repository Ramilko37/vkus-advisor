import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOnboarding } from "../../hooks/useOnboarding";
import { createInitialOnboardingState, saveOnboardingState } from "../../services/onboardingRepository";
import { DEFAULT_PROFILE } from "../../services/profileRepository";
import type { UserProfile } from "../../types/domain";
import { OnboardingFlow } from "./OnboardingFlow";

const mocks = vi.hoisted(() => ({
  findLentaStores: vi.fn(),
  suggestAddresses: vi.fn(),
  reverseGeocodeAddress: vi.fn(),
}));

vi.mock("../../services/catalog", () => ({
  findLentaStores: mocks.findLentaStores,
  suggestAddresses: mocks.suggestAddresses,
  reverseGeocodeAddress: mocks.reverseGeocodeAddress,
}));

describe("OnboardingFlow", () => {
  beforeEach(() => {
    mocks.findLentaStores.mockResolvedValue([]);
    mocks.suggestAddresses.mockResolvedValue([]);
    mocks.reverseGeocodeAddress.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    mocks.findLentaStores.mockReset();
    mocks.suggestAddresses.mockReset();
    mocks.reverseGeocodeAddress.mockReset();
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
  });

  it("shows one optional value screen and opens the main product on Try", () => {
    render(<Harness onDeliveryComplete={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Соберём покупки вместо вас" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Адрес")).not.toBeInTheDocument();
    expect(screen.queryByText("Что учитывать в ваших корзинах?")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Попробовать" }));

    expect(screen.queryByRole("dialog", { name: "Первоначальная настройка" })).not.toBeInTheDocument();
    expect(screen.getByText("Главный экран")).toBeInTheDocument();
  });

  it("completes deferred delivery and returns the preserved request", async () => {
    const onDeliveryComplete = vi.fn();
    mocks.findLentaStores.mockResolvedValue([
      { id: "525", name: "ТК1453", address: "Москва, Овчинниковская наб., 22/24с1", distanceMeters: 1127 },
    ]);
    saveOnboardingState({
      ...createInitialOnboardingState(),
      status: "in_progress",
      step: "delivery",
      requestDraft: "ужины на три дня",
    });
    render(<Harness onDeliveryComplete={onDeliveryComplete} />);

    fireEvent.change(screen.getByLabelText("Адрес"), { target: { value: "Москва, Вавилова 19" } });
    expect(await screen.findByText("ТК1453, Москва, Овчинниковская наб., 22/24с1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));

    await waitFor(() => expect(onDeliveryComplete).toHaveBeenCalledWith(expect.objectContaining({
      address: "Москва, Вавилова 19",
      lentaStoreId: "525",
    }), "ужины на три дня"));
    expect(screen.queryByRole("dialog", { name: "Первоначальная настройка" })).not.toBeInTheDocument();
  });

  it("continues with the saved address when Lenta is unavailable", async () => {
    const onDeliveryComplete = vi.fn();
    mocks.findLentaStores.mockResolvedValue([]);
    saveOnboardingState({
      ...createInitialOnboardingState(),
      status: "in_progress",
      step: "delivery",
      requestDraft: "продукты на неделю для семьи",
    });
    render(<Harness onDeliveryComplete={onDeliveryComplete} />);

    fireEvent.change(screen.getByLabelText("Адрес"), { target: { value: "Москва, Вавилова 19" } });
    expect(await screen.findByText(/Не нашли ближайшую Ленту/i)).toBeInTheDocument();

    const continueButton = screen.getByRole("button", { name: "Продолжить" });
    expect(continueButton).toBeEnabled();
    fireEvent.click(continueButton);

    await waitFor(() => expect(onDeliveryComplete).toHaveBeenCalledWith(expect.objectContaining({
      address: "Москва, Вавилова 19",
    }), "продукты на неделю для семьи"));
    expect(onDeliveryComplete.mock.calls[0]?.[0]).not.toHaveProperty("lentaStoreId");
  });

  it("fills the address from browser geolocation", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: PositionCallback) => success({ coords: { latitude: 55.76, longitude: 37.62 } } as GeolocationPosition)),
      },
    });
    mocks.reverseGeocodeAddress.mockResolvedValue(["г Москва, ул Петровка, д 17"]);
    saveOnboardingState({
      ...createInitialOnboardingState(),
      status: "in_progress",
      step: "delivery",
      requestDraft: "ужины",
    });
    render(<Harness onDeliveryComplete={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Определить адрес автоматически" }));

    expect(await screen.findByLabelText("Адрес")).toHaveValue("г Москва, ул Петровка, д 17");
  });
});

function Harness({ onDeliveryComplete }: { onDeliveryComplete: (profile: UserProfile, request: string) => void }) {
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const onboarding = useOnboarding({ ready: true });


  return (
    <>
      <div>Главный экран</div>
      {onboarding.visible && (
        <OnboardingFlow
          onboarding={onboarding}
          profile={profile}
          onProfileChange={setProfile}
          onDeliveryComplete={onDeliveryComplete}
        />
      )}
    </>
  );
}
