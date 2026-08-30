import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BasketResults, ConversationPanel, Header, ProfileControl } from "./components";
import { DEFAULT_PROFILE } from "./services/profileRepository";
import type { BasketPriority, BasketVariant, NormalizedProduct } from "./types/domain";

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

describe("Header", () => {
  afterEach(() => cleanup());

  it("frames the home screen as a grocery delivery planner", () => {
    render(<Header route="home" />);

    expect(screen.getByText("AI-планировщик корзины")).toBeInTheDocument();
    expect(screen.getByText("Доставка")).toBeInTheDocument();
    expect(screen.getByText("Что купить сегодня?")).toBeInTheDocument();
  });
});

describe("ConversationPanel", () => {
  afterEach(() => cleanup());

  it("adds grocery category shortcuts to the request", () => {
    render(
      <ConversationPanel
        planner={{
          state: {
            stage: "idle",
            messages: [],
            intent: null,
            variants: [],
            selectedId: null,
            error: null,
            catalogMode: "live",
            modelNames: [],
            pendingMessage: null,
          },
          submit: vi.fn(),
          retry: vi.fn(),
          reconnectCatalog: vi.fn(),
          mockResults: vi.fn(),
          createCart: vi.fn(),
          cancel: vi.fn(),
          replaceItem: vi.fn(),
          selectVariant: vi.fn(),
          clearVariantSelection: vi.fn(),
          updateItems: vi.fn(),
        } as never}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Овощи" }));

    expect(screen.getByLabelText("Что собрать?")).toHaveValue("овощи и зелень");
  });
});

describe("BasketResults", () => {
  afterEach(() => cleanup());

  it("shows retailer tabs and switches retailer variants", () => {
    render(
      <BasketResults
        planner={{
          state: {
            stage: "ready",
            messages: [],
            intent: null,
            variants: [
              makeVariant("vkusvill", "balanced", "Творог ВкусВилл"),
              makeVariant("vkusvill", "budget", "Кефир ВкусВилл"),
              makeVariant("vkusvill", "speed", "Салат ВкусВилл"),
              makeVariant("lenta", "balanced", "Молоко Лента"),
              makeVariant("lenta", "budget", "Гречка Лента"),
              makeVariant("lenta", "speed", "Курица Лента"),
              makeVariant("pyaterochka", "balanced", "Хлеб Пятёрочка"),
              makeVariant("pyaterochka", "budget", "Яйца Пятёрочка"),
              makeVariant("pyaterochka", "speed", "Сыр Пятёрочка"),
            ],
            selectedId: null,
            error: null,
            catalogMode: "live",
            modelNames: [],
            pendingMessage: null,
          },
          submit: vi.fn(),
          retry: vi.fn(),
          reconnectCatalog: vi.fn(),
          mockResults: vi.fn(),
          createCart: vi.fn(),
          cancel: vi.fn(),
          replaceItem: vi.fn(),
          selectVariant: vi.fn(),
          clearVariantSelection: vi.fn(),
          updateItems: vi.fn(),
        } as never}
      />,
    );

    expect(screen.getByRole("tab", { name: /ВкусВилл/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Лента/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Пятёрочка/ })).toBeInTheDocument();
    expect(screen.getByText("Творог ВкусВилл")).toBeInTheDocument();
    expect(screen.queryByText("Молоко Лента")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Лента/ }));

    expect(screen.getByRole("tab", { name: /Лента/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Молоко Лента")).toBeInTheDocument();
    expect(screen.getByText("Гречка Лента")).toBeInTheDocument();
    expect(screen.queryByText("Творог ВкусВилл")).not.toBeInTheDocument();
  });

  it("keeps all retailer tabs visible when one provider has no baskets", () => {
    render(
      <BasketResults
        planner={{
          state: {
            stage: "ready",
            messages: [],
            intent: null,
            variants: [
              makeVariant("vkusvill", "balanced", "Творог ВкусВилл"),
              makeVariant("vkusvill", "budget", "Кефир ВкусВилл"),
              makeVariant("vkusvill", "speed", "Салат ВкусВилл"),
              makeVariant("lenta", "balanced", "Молоко Лента"),
              makeVariant("lenta", "budget", "Гречка Лента"),
              makeVariant("lenta", "speed", "Курица Лента"),
            ],
            selectedId: null,
            error: null,
            catalogMode: "live",
            modelNames: [],
            pendingMessage: null,
          },
          submit: vi.fn(),
          retry: vi.fn(),
          reconnectCatalog: vi.fn(),
          mockResults: vi.fn(),
          createCart: vi.fn(),
          cancel: vi.fn(),
          replaceItem: vi.fn(),
          selectVariant: vi.fn(),
          clearVariantSelection: vi.fn(),
          updateItems: vi.fn(),
        } as never}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Пятёрочка/ }));

    expect(screen.getByRole("tab", { name: /Пятёрочка/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Пока нет корзин для Пятёрочка")).toBeInTheDocument();
  });

  it("shows retailer diagnostics for an empty retailer tab", () => {
    render(
      <BasketResults
        planner={{
          state: {
            stage: "ready",
            messages: [],
            intent: null,
            variants: [
              makeVariant("vkusvill", "balanced", "Творог ВкусВилл"),
              makeVariant("vkusvill", "budget", "Кефир ВкусВилл"),
              makeVariant("vkusvill", "speed", "Салат ВкусВилл"),
            ],
            retailerResults: [
              { retailer: "vkusvill", status: "ready", candidateCount: 12, selectedCandidateCount: 12, variantCount: 3 },
              { retailer: "lenta", status: "failed", candidateCount: 16, selectedCandidateCount: 16, variantCount: 0, message: "Не удалось собрать три валидные корзины." },
              { retailer: "pyaterochka", status: "no_candidates", candidateCount: 0, selectedCandidateCount: 0, variantCount: 0 },
            ],
            selectedId: null,
            error: null,
            catalogMode: "live",
            modelNames: [],
            pendingMessage: null,
          },
          submit: vi.fn(),
          retry: vi.fn(),
          reconnectCatalog: vi.fn(),
          mockResults: vi.fn(),
          createCart: vi.fn(),
          cancel: vi.fn(),
          replaceItem: vi.fn(),
          selectVariant: vi.fn(),
          clearVariantSelection: vi.fn(),
          updateItems: vi.fn(),
        } as never}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Лента/ }));

    expect(screen.getByText("Не удалось собрать три валидные корзины.")).toBeInTheDocument();
    expect(screen.getByText("Кандидатов: 16")).toBeInTheDocument();
  });
});

function makeVariant(retailer: NonNullable<NormalizedProduct["retailer"]>, strategy: BasketPriority, productName: string): BasketVariant {
  return {
    id: `${retailer}:${strategy}`,
    retailer,
    strategy,
    title: productName,
    summary: productName,
    tradeoffs: [],
    items: [
      {
        id: `${retailer}:${productName}`,
        xmlId: `${retailer}:${productName}`,
        retailer,
        name: productName,
        priceRub: 100,
        sourceQuery: productName,
        isDemo: false,
        quantity: 1,
        role: "main",
        reason: "Подходит под запрос",
      },
    ],
    totalRub: 100,
    uniqueItemsCount: 1,
    warnings: [],
  };
}
