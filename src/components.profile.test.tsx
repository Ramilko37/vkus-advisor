import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileControl } from "./components";
import { DEFAULT_PROFILE } from "./services/profileRepository";

describe("ProfileControl", () => {
  afterEach(() => cleanup());

  it("keeps the profile focused on auth, address, household and stable tags", () => {
    const onChange = vi.fn();
    render(
      <ProfileControl
        profile={DEFAULT_PROFILE}
        authConfigured={false}
        authStatus="guest"
        authError={null}
        onChange={onChange}
        onSendOtp={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Добавить адрес" }));

    expect(screen.getByRole("dialog", { name: "Профиль" })).toBeInTheDocument();
    expect(screen.getByText("Настройки, которые будем учитывать в следующих подборках.")).toBeInTheDocument();
    expect(screen.getByText("Домохозяйство")).toBeInTheDocument();
    expect(screen.queryByText("Дней")).not.toBeInTheDocument();
    expect(screen.queryByText("Бюджет")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Очистить" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить изменения" })).toBeDisabled();
  });

  it("saves guest address, household and tag defaults", () => {
    const onChange = vi.fn();
    render(
      <ProfileControl
        profile={DEFAULT_PROFILE}
        authConfigured={false}
        authStatus="guest"
        authError={null}
        onChange={onChange}
        onSendOtp={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Добавить адрес" }));
    fireEvent.change(screen.getByLabelText("Адрес"), { target: { value: " Москва, Тверская 1 " } });
    fireEvent.click(screen.getByRole("button", { name: "Увеличить количество людей" }));
    fireEvent.click(screen.getByRole("button", { name: "Добавить ограничение" }));
    fireEvent.change(screen.getByLabelText("Новое ограничение"), { target: { value: " грибы " } });
    fireEvent.keyDown(screen.getByLabelText("Новое ограничение"), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Добавить предпочтение" }));
    fireEvent.change(screen.getByLabelText("Новое предпочтение"), { target: { value: " больше белка " } });
    fireEvent.keyDown(screen.getByLabelText("Новое предпочтение"), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить изменения" }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      address: "Москва, Тверская 1",
      householdSize: 2,
      excludedIngredients: ["грибы"],
      preferences: ["больше белка"],
    }));
  });

  it("shows Email OTP entry when Supabase auth is configured", () => {
    const onSendOtp = vi.fn();
    render(
      <ProfileControl
        profile={DEFAULT_PROFILE}
        authConfigured
        authStatus="signedOut"
        authError={null}
        onChange={vi.fn()}
        onSendOtp={onSendOtp}
        onSignOut={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Добавить адрес" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: " USER@EXAMPLE.COM " } });
    fireEvent.click(screen.getByRole("button", { name: "Войти по email" }));

    expect(onSendOtp).toHaveBeenCalledWith("USER@EXAMPLE.COM");
  });
});
