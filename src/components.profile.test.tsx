import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { BasketResults, ConversationPanel, EmptyResultsState, ProfileControl, SelectedBasketActions } from "./components";
import { DEFAULT_PROFILE } from "./services/profileRepository";
import type { BasketPriority, BasketVariant, NormalizedProduct } from "./types/domain";

describe("ProfileControl", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

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

  it("opens with one profile title and does not force focus into the address field", () => {
    render(
      <ProfileControl
        profile={DEFAULT_PROFILE}
        authConfigured={false}
        authStatus="guest"
        authError={null}
        onChange={vi.fn()}
        onSendOtp={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Добавить адрес" }));

    expect(screen.getAllByText("Профиль")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { name: "Профиль" })).toHaveLength(1);
    expect(screen.getByLabelText("Адрес")).not.toHaveFocus();
  });

  it("resolves the browser geolocation into an editable address", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => success({
      coords: { latitude: 55.75, longitude: 37.61 } as GeolocationCoordinates,
      timestamp: Date.now(),
    } as GeolocationPosition));
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ suggestions: ["г Москва, ул Тверская, д 1"] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ProfileControl
        profile={DEFAULT_PROFILE}
        authConfigured={false}
        authStatus="guest"
        authError={null}
        onChange={vi.fn()}
        onSendOtp={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Добавить адрес" }));
    fireEvent.click(screen.getByRole("button", { name: "Определить автоматически" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/address/geolocate",
      expect.objectContaining({ body: JSON.stringify({ lat: 55.75, lon: 37.61 }) }),
    ));
    expect(await screen.findByDisplayValue("г Москва, ул Тверская, д 1")).toBeInTheDocument();
  });

  it("saves guest address, household and tag defaults", () => {
    const onChange = vi.fn();
    const profile = {
      ...DEFAULT_PROFILE,
      address: "Москва, Тверская 1",
      lentaStoreId: "525",
      lentaStoreName: "ТК1453",
      lentaStoreAddress: "Москва, Овчинниковская наб., 22/24с1",
    };
    render(
      <ProfileControl
        profile={profile}
        authConfigured={false}
        authStatus="guest"
        authError={null}
        onChange={onChange}
        onSendOtp={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Адрес: Москва, Тверская 1" }));
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

  it("automatically saves the nearest Lenta store with a new address", async () => {
    const onChange = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        stores: [
          { id: "525", name: "ТК1453", address: "Москва, Овчинниковская наб., 22/24с1", distanceMeters: 1127 },
          { id: "3560", name: "ТК1900", address: "Москва, 3-я Владимирская улица, 23", distanceMeters: 10823 },
        ],
      }),
    }));
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
    fireEvent.change(screen.getByLabelText("Адрес"), { target: { value: "Москва, Тверская 1" } });

    expect(screen.getByRole("button", { name: "Сохранить изменения" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить изменения" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      address: "Москва, Тверская 1",
      lentaStoreId: "525",
      lentaStoreName: "ТК1453",
      lentaStoreAddress: "Москва, Овчинниковская наб., 22/24с1",
    })));
  });

  it("saves a delivery address when the optional Lenta lookup has no result", async () => {
    const onChange = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ stores: [] }),
    }));
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
    fireEvent.change(screen.getByLabelText("Адрес"), { target: { value: "Москва, Вавилова 19" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить изменения" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      address: "Москва, Вавилова 19",
    })));
    expect(onChange.mock.calls[0]?.[0]).not.toHaveProperty("lentaStoreId");
    expect(screen.queryByText("Не удалось подобрать магазин Ленты. Уточните адрес или повторите поиск.")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Профиль" })).not.toBeInTheDocument();
  });

  it("shows DaData suggestions in the profile address input", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ suggestions: ["г Москва, ул Тверская, д 1"] }),
    }));
    render(
      <ProfileControl
        profile={DEFAULT_PROFILE}
        authConfigured={false}
        authStatus="guest"
        authError={null}
        onChange={vi.fn()}
        onSendOtp={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Добавить адрес" }));
    fireEvent.change(screen.getByLabelText("Адрес"), { target: { value: "Москва Твер" } });
    fireEvent.click(await screen.findByRole("option", { name: "г Москва, ул Тверская, д 1" }));

    expect(screen.getByLabelText("Адрес")).toHaveValue("г Москва, ул Тверская, д 1");
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

describe("EmptyResultsState", () => {
  afterEach(() => cleanup());

  it("uses the pixel basket identity instead of a generic line icon", () => {
    render(<EmptyResultsState onStart={vi.fn()} />);

    expect(document.querySelector(".pixel-basket-mark--empty")).not.toBeNull();
  });
});

describe("ConversationPanel", () => {
  afterEach(() => cleanup());

  it("routes a written request to delivery setup when the address is missing", () => {
    const submit = vi.fn();
    const onNeedsDelivery = vi.fn();
    render(
      <ConversationPanel
        hasDeliveryAddress={false}
        onNeedsDelivery={onNeedsDelivery}
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
          submit,
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

    fireEvent.change(screen.getByLabelText("Что собрать?"), { target: { value: "ужины на три дня" } });

    expect(screen.getByText("Введите запрос — адрес добавим на следующем шаге.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    expect(onNeedsDelivery).toHaveBeenCalledWith("ужины на три дня");
    expect(submit).not.toHaveBeenCalled();
  });

  it("submits with an address even when no Lenta store is selected", () => {
    const submit = vi.fn();
    render(
      <ConversationPanel
        hasDeliveryAddress
        planner={{
          state: {
            stage: "idle",
            messages: [],
            intent: null,
            variants: [],
            retailerResults: [],
            selectedId: null,
            error: null,
            catalogMode: "live",
            modelNames: [],
            pendingMessage: null,
          },
          submit,
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

    fireEvent.change(screen.getByLabelText("Что собрать?"), { target: { value: "ужины на три дня" } });
    fireEvent.click(screen.getByRole("button", { name: "Подобрать 3 корзины" }));

    expect(submit).toHaveBeenCalledWith("ужины на три дня");
  });

  it("adds task shortcuts to the request", () => {
    render(
      <ConversationPanel
        hasDeliveryAddress
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

    fireEvent.click(screen.getByRole("button", { name: "Без готовки" }));

    expect(screen.getByLabelText("Что собрать?")).toHaveValue("почти без готовки");
  });
});

describe("BasketResults", () => {
  afterEach(() => cleanup());

  it("provides a new-request action back to the home screen", () => {
    const onStartNewSearch = vi.fn();
    render(
      <BasketResults
        planner={{
          state: {
            stage: "ready", messages: [], intent: null,
            variants: [makeVariant("vkusvill", "balanced", "Творог ВкусВилл")],
            retailerResults: [], selectedId: null, error: null, catalogMode: "live", modelNames: [], pendingMessage: null,
          },
          submit: vi.fn(), retry: vi.fn(), reconnectCatalog: vi.fn(), mockResults: vi.fn(), createCart: vi.fn(), cancel: vi.fn(), replaceItem: vi.fn(), selectVariant: vi.fn(), clearVariantSelection: vi.fn(), updateItems: vi.fn(),
        } as never}
        onStartNewSearch={onStartNewSearch}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Новый запрос" }));
    expect(onStartNewSearch).toHaveBeenCalledOnce();
  });

  it("shows and dismisses the first-results hint", () => {
    const onDismissResultsHint = vi.fn();
    render(
      <BasketResults
        planner={{
          state: {
            stage: "ready",
            messages: [],
            intent: null,
            variants: [makeVariant("vkusvill", "balanced", "Творог ВкусВилл")],
            retailerResults: [],
            selectedId: null,
            error: null,
            catalogMode: "live",
            modelNames: [],
            pendingMessage: null,
          },
          submit: vi.fn(), retry: vi.fn(), reconnectCatalog: vi.fn(), mockResults: vi.fn(), createCart: vi.fn(), cancel: vi.fn(), replaceItem: vi.fn(), selectVariant: vi.fn(), clearVariantSelection: vi.fn(), updateItems: vi.fn(),
        } as never}
        showResultsHint
        onDismissResultsHint={onDismissResultsHint}
      />,
    );

    expect(screen.getByText(/Готово. Мы собрали несколько способов/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Понятно" }));
    expect(onDismissResultsHint).toHaveBeenCalledOnce();
  });

  it("shows the basket-edit hint and reports the first edit", () => {
    const onBasketEdit = vi.fn();
    const variant = makeVariant("vkusvill", "balanced", "Творог ВкусВилл");
    render(
      <BasketResults
        planner={{
          state: { stage: "ready", messages: [], intent: null, variants: [variant], retailerResults: [], selectedId: variant.id, error: null, catalogMode: "live", modelNames: [], pendingMessage: null },
          submit: vi.fn(), retry: vi.fn(), reconnectCatalog: vi.fn(), mockResults: vi.fn(), createCart: vi.fn(), cancel: vi.fn(), replaceItem: vi.fn(), selectVariant: vi.fn(), clearVariantSelection: vi.fn(), updateItems: vi.fn(),
        } as never}
        showBasketEditHint
        onBasketEdit={onBasketEdit}
      />,
    );

    expect(screen.getByText(/Корзина не фиксированная/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Увеличить" }));
    expect(onBasketEdit).toHaveBeenCalledWith("vkusvill");
  });

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

  it("hides retailers that have no basket options", () => {
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

    expect(screen.getByRole("tab", { name: /ВкусВилл/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Лента/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Пятёрочка/ })).not.toBeInTheDocument();
  });

  it("does not expose a failed retailer as a selectable tab", () => {
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

    expect(screen.queryByRole("tab", { name: /Лента/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Не удалось собрать три валидные корзины.")).not.toBeInTheDocument();
    expect(screen.queryByText("Кандидатов: 16")).not.toBeInTheDocument();
  });
});

describe("SelectedBasketActions", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows automatic cart capability for VkusVill", () => {
    const variant = makeVariant("vkusvill", "balanced", "Творог ВкусВилл");

    render(
      <SelectedBasketActions
        variant={variant}
        variants={[variant]}
        mode="live"
        creating={false}
        onItems={vi.fn()}
        onReplace={vi.fn()}
        onCreateCart={vi.fn()}
      />,
    );

    expect(screen.getByText("ВкусВилл · Автокорзина")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Открыть корзину во ВкусВилле" })).toBeInTheDocument();
  });

  it("copies a refreshed Lenta list without pretending to create an automatic cart", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const variant = makeVariant("lenta", "balanced", "Молоко Лента");
    variant.items[0].quantity = 2;
    variant.totalRub = 200;
    const refreshedItem = { ...variant.items[0], priceRub: 125 };

    render(
      <SelectedBasketActions
        variant={variant}
        variants={[variant]}
        mode="live"
        creating={false}
        onItems={vi.fn()}
        onReplace={vi.fn()}
        onCreateCart={vi.fn().mockResolvedValue({ items: [refreshedItem] })}
      />,
    );

    expect(screen.getByText("Лента · Список")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Проверить и скопировать список Ленты" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("2 × Молоко Лента — 250 ₽"));
    expect(screen.getByRole("status")).toHaveTextContent("Список проверен и скопирован");
    expect(screen.queryByRole("link", { name: /Открыть Ленту/ })).not.toBeInTheDocument();
  });

  it("shows an empty state, restores the last item, and disables checkout", () => {
    const variant = makeVariant("vkusvill", "balanced", "Творог ВкусВилл");
    const onBackToVariants = vi.fn();
    const onCreateCart = vi.fn();

    render(<SelectedBasketHarness initial={variant} onBackToVariants={onBackToVariants} onCreateCart={onCreateCart} />);
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));

    expect(screen.getByRole("heading", { name: "В корзине больше нет товаров" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Вернуть последний товар" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Открыть корзину во ВкусВилле" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "К вариантам" }));
    expect(onBackToVariants).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Вернуть последний товар" }));
    expect(screen.getByText("Творог ВкусВилл")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Открыть корзину во ВкусВилле" })).toBeEnabled();
  });
});

function SelectedBasketHarness({ initial, onBackToVariants, onCreateCart }: { initial: BasketVariant; onBackToVariants: () => void; onCreateCart: () => Promise<never> | never }) {
  const [variant, setVariant] = useState(initial);
  const updateItems = (items: BasketVariant["items"]) => {
    setVariant((current) => ({
      ...current,
      items,
      uniqueItemsCount: items.length,
      totalRub: items.reduce((sum, item) => sum + item.priceRub * item.quantity, 0),
    }));
  };

  return (
    <SelectedBasketActions
      variant={variant}
      variants={[variant]}
      mode="live"
      creating={false}
      onItems={updateItems}
      onReplace={vi.fn()}
      onCreateCart={onCreateCart as never}
      onBackToVariants={onBackToVariants}
    />
  );
}

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
