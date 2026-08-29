import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileControl } from "./components";
import { DEFAULT_PROFILE } from "./services/profileRepository";

describe("ProfileControl", () => {
  afterEach(() => cleanup());

  it("updates guest profile fields without Supabase auth", () => {
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
    fireEvent.change(screen.getByLabelText("Адрес"), { target: { value: "Москва" } });
    fireEvent.change(screen.getByLabelText("Людей"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ address: "Москва", householdSize: 2 }));
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
