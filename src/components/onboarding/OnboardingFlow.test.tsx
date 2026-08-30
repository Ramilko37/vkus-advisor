import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOnboarding } from "../../hooks/useOnboarding";
import { DEFAULT_PROFILE } from "../../services/profileRepository";
import type { UserProfile } from "../../types/domain";
import { OnboardingFlow } from "./OnboardingFlow";

const mocks = vi.hoisted(() => ({ findLentaStores: vi.fn() }));

vi.mock("../../services/catalog", () => ({ findLentaStores: mocks.findLentaStores }));

describe("OnboardingFlow", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    mocks.findLentaStores.mockReset();
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

  it("keeps entered data when going back and allows delivery without Lenta", async () => {
    mocks.findLentaStores.mockResolvedValue([]);
    render(<Harness onProfileChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Начать" }));
    fireEvent.change(screen.getByLabelText("Адрес"), { target: { value: "Москва, Вавилова 19" } });
    expect(await screen.findByText("Не нашли подходящий магазин для этого адреса")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Продолжить без Ленты" }));
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));

    expect(screen.getByLabelText("Адрес")).toHaveValue("Москва, Вавилова 19");
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
