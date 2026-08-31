import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOnboarding } from "../../hooks/useOnboarding";
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

  it("finishes after profile setup and reveals the main screen", async () => {
    const onProfileChange = vi.fn();
    mocks.findLentaStores.mockResolvedValue([
      { id: "525", name: "Лента", address: "Овчинниковская наб., 22/24с1", distanceMeters: 1100 },
    ]);
    render(<Harness onProfileChange={onProfileChange} />);

    expect(screen.getByRole("heading", { name: "Соберём покупки вместо вас" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Начать" }));

    fireEvent.change(screen.getByLabelText("Адрес"), { target: { value: "Москва, Тверская 1" } });
    expect(await screen.findByText("Лента, Овчинниковская наб., 22/24с1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));

    expect(screen.getByRole("heading", { name: "Что учитывать в ваших корзинах?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Увеличить количество людей" }));
    fireEvent.change(screen.getByLabelText("Что точно не покупать?"), { target: { value: "грибы" } });
    fireEvent.keyDown(screen.getByLabelText("Что точно не покупать?"), { key: "Enter" });
    fireEvent.change(screen.getByLabelText("Что предпочитаете?"), { target: { value: "больше белка" } });
    fireEvent.keyDown(screen.getByLabelText("Что предпочитаете?"), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Первоначальная настройка" })).not.toBeInTheDocument();
      expect(screen.getByText("Главный экран")).toBeInTheDocument();
      expect(onProfileChange).toHaveBeenCalledWith(expect.objectContaining({
        address: "Москва, Тверская 1",
        lentaStoreId: "525",
        householdSize: 2,
        excludedIngredients: ["грибы"],
        preferences: ["больше белка"],
      }));
    });
  });

  it("automatically selects the nearest Lenta when several stores are found", async () => {
    const onProfileChange = vi.fn();
    mocks.findLentaStores.mockResolvedValue([
      { id: "525", name: "ТК1453", address: "Москва, Овчинниковская наб., 22/24с1", distanceMeters: 1127 },
      { id: "3560", name: "ТК1900", address: "Москва, 3-я Владимирская улица, 23", distanceMeters: 10823 },
    ]);
    render(<Harness onProfileChange={onProfileChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Начать" }));
    fireEvent.change(screen.getByLabelText("Адрес"), { target: { value: "Москва, Вавилова 19" } });
    expect(await screen.findByRole("radio", { name: /ТК1453/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Продолжить" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));

    await waitFor(() => expect(onProfileChange).toHaveBeenCalledWith(expect.objectContaining({
      address: "Москва, Вавилова 19",
      lentaStoreId: "525",
    })));
  });

  it("does not continue without a resolved Lenta store", async () => {
    mocks.findLentaStores.mockResolvedValue([]);
    render(<Harness onProfileChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Начать" }));
    fireEvent.change(screen.getByLabelText("Адрес"), { target: { value: "Москва, Вавилова 19" } });

    expect(await screen.findByText("Не нашли подходящий магазин для этого адреса")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Продолжить" })).toBeDisabled();
  });

  it("preserves a trailing space while the address is being typed", () => {
    render(<Harness onProfileChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Начать" }));

    fireEvent.change(screen.getByLabelText("Адрес"), { target: { value: "Москва " } });

    expect(screen.getByLabelText("Адрес")).toHaveValue("Москва ");
  });

  it("shows DaData suggestions and selects an address", async () => {
    mocks.suggestAddresses.mockResolvedValue(["г Москва, ул Тверская, д 1"]);
    render(<Harness onProfileChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Начать" }));

    fireEvent.change(screen.getByLabelText("Адрес"), { target: { value: "Москва Твер" } });
    fireEvent.click(await screen.findByRole("option", { name: "г Москва, ул Тверская, д 1" }));

    expect(screen.getByLabelText("Адрес")).toHaveValue("г Москва, ул Тверская, д 1");
  });

  it("closes address suggestions with Escape without dismissing onboarding", async () => {
    mocks.suggestAddresses.mockResolvedValue(["г Москва, ул Тверская, д 1"]);
    render(<Harness onProfileChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Начать" }));
    const input = screen.getByLabelText("Адрес");
    fireEvent.change(input, { target: { value: "Москва Твер" } });
    expect(await screen.findByRole("option")).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Первоначальная настройка" })).toBeInTheDocument();
  });

  it("fills the address from browser geolocation", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: PositionCallback) => success({ coords: { latitude: 55.76, longitude: 37.62 } } as GeolocationPosition)),
      },
    });
    mocks.reverseGeocodeAddress.mockResolvedValue(["г Москва, ул Петровка, д 17"]);
    render(<Harness onProfileChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Начать" }));

    fireEvent.click(screen.getByRole("button", { name: "Определить адрес автоматически" }));

    expect(await screen.findByLabelText("Адрес")).toHaveValue("г Москва, ул Петровка, д 17");
  });
});

function Harness({ onProfileChange }: { onProfileChange: (profile: UserProfile) => void }) {
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const onboarding = useOnboarding({ ready: true });
  return (
    <>
      <div>Главный экран</div>
      {onboarding.visible && <OnboardingFlow
        onboarding={onboarding}
        profile={profile}
        onProfileChange={(next) => {
          setProfile(next);
          onProfileChange(next);
        }}
      />}
    </>
  );
}
