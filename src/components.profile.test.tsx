import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BasketResults, ConversationPanel, Header, ProfileControl, SelectedBasketActions } from "./components";
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

  it("does not save a delivery address without a resolved Lenta store", async () => {
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

    expect(await screen.findByText("Не удалось подобрать магазин Ленты. Уточните адрес или повторите поиск.")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Профиль" })).toBeInTheDocument();
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

  it("adds grocery category shortcuts to the request", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Овощи" }));

    expect(screen.getByLabelText("Что собрать?")).toHaveValue("овощи и зелень");
  });
});

describe("BasketResults", () => {
  afterEach(() => cleanup());
  it("labels Eats preview cards and shows upstream failures on the results screen", () => {
    const variant = makeVariant("lenta", "balanced", "Молоко");
    variant.items = variant.items.map(item => ({ ...item, catalogProvider: "yandex_eats", retailerPlaceSlug: "lenta_test", xmlId: `yandex_eats:lenta_test:${item.xmlId}` }));
    render(<BasketResults planner={{
      state: { stage: "ready", messages: [], intent: null, variants: [variant], retailerResults: [], selectedId: null, error: null, catalogMode: "live", modelNames: [], pendingMessage: null, catalogWarnings: ["Товары Яндекс Еды сейчас недоступны. Попробуйте позже."] },
      createCart: vi.fn(), clearVariantSelection: vi.fn(), updateItems: vi.fn(), replaceItem: vi.fn(),
    } as never} />);
    expect(screen.getByText(/Предварительная подборка Яндекс Еды: цены и наличие не перепроверены/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Товары Яндекс Еды сейчас недоступны");
  });
  it("opens an Eats store with honest handoff copy", () => {
    const variant = makeVariant("lenta", "balanced", "Молоко");
    variant.items = variant.items.map(item => ({ ...item, catalogProvider: "yandex_eats", retailerPlaceSlug: "lenta_test", xmlId: `yandex_eats:lenta_test:${item.xmlId}` }));
    render(<BasketResults planner={{
      state: { stage: "ready", messages: [], intent: null, variants: [variant], retailerResults: [], selectedId: variant.id, error: null, catalogMode: "live", modelNames: [], pendingMessage: null },
      createCart: vi.fn(), clearVariantSelection: vi.fn(), updateItems: vi.fn(), replaceItem: vi.fn(),
    } as never} />);
    expect(screen.getByRole("link", { name: "Открыть магазин в Яндекс Еде" })).toHaveAttribute("href", "https://eda.yandex.ru/retail/lenta_test");
    expect(screen.queryByText(/Список проверен/)).not.toBeInTheDocument();
  });

  it("provides a header link back to the home screen", () => {
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
      />,
    );

    expect(screen.getByRole("link", { name: "На главную" })).toHaveAttribute("href", "/");
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

describe("SelectedBasketActions", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("copies the refreshed Lenta list and offers the official Lenta basket after validation", async () => {
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
        onCreateCart={vi.fn().mockResolvedValue({ url: "https://lenta.com/basket/", items: [refreshedItem] })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Проверить список Ленты" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("2 × Молоко Лента — 250 ₽"));
    expect(screen.getByRole("status")).toHaveTextContent("Список проверен и скопирован");
    expect(screen.getByRole("link", { name: "Открыть Ленту" })).toHaveAttribute("href", "https://lenta.com/basket/");
    expect(screen.queryByText("Открыть во ВкусВилл")).not.toBeInTheDocument();
  });

  it("labels the read-only Lavka handoff without claiming checkout", async () => {
    const variant = makeVariant("lavka", "balanced", "Молоко Лавка");
    render(
      <SelectedBasketActions
        variant={variant}
        variants={[variant]}
        mode="live"
        creating={false}
        onItems={vi.fn()}
        onReplace={vi.fn()}
        onCreateCart={vi.fn().mockResolvedValue({ url: "https://lavka.yandex.ru/", items: variant.items })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Проверить товары" }));

    expect(await screen.findByRole("link", { name: "Открыть Лавку" })).toHaveAttribute("href", "https://lavka.yandex.ru/");
    expect(screen.queryByText(/Оформить корзину/)).not.toBeInTheDocument();
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
