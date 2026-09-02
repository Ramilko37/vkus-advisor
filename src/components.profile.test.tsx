import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BasketResults, ConversationPanel, Header, ProfileControl, SelectedBasketActions } from "./components";
import { DEFAULT_PROFILE } from "./services/profileRepository";
import type { BasketIntent, BasketStrategy, BasketVariant, NormalizedProduct } from "./types/domain";

describe("ProfileControl", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("delegates address changes to the shared address flow", () => {
    const onOpenAddress = vi.fn();
    render(
      <ProfileControl
        profile={{ ...DEFAULT_PROFILE, address: "г Москва, ул Тверская, д 1", lentaStoreId: "525" }}
        authConfigured={false}
        authStatus="guest"
        authError={null}
        onChange={vi.fn()}
        onSendOtp={vi.fn()}
        onSignOut={vi.fn()}
        onOpenAddress={onOpenAddress}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Открыть профиль" }));
    expect(screen.queryByLabelText("Адрес")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Изменить адрес" }));

    expect(onOpenAddress).toHaveBeenCalledOnce();
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

    fireEvent.click(screen.getByRole("button", { name: "Открыть профиль" }));

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

    fireEvent.click(screen.getByRole("button", { name: "Открыть профиль" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Открыть профиль" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Открыть профиль" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Открыть профиль" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Открыть профиль" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: " USER@EXAMPLE.COM " } });
    fireEvent.click(screen.getByRole("button", { name: "Войти по email" }));

    expect(onSendOtp).toHaveBeenCalledWith("USER@EXAMPLE.COM");
  });
});

describe("Header", () => {
  afterEach(() => cleanup());

  it("shows a compact actionable delivery address", () => {
    const onOpenAddress = vi.fn();
    render(<Header route="home" address="г Москва, ул Тверская, д 1" onOpenAddress={onOpenAddress} />);

    expect(screen.getByText("Тверская, 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Адрес доставки: г Москва, ул Тверская, д 1" }));
    expect(onOpenAddress).toHaveBeenCalledOnce();
    expect(screen.getByText("Изменить")).toBeInTheDocument();
    expect(screen.queryByText("Что купить сегодня?")).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Подобрать 3 варианта" }));

    expect(submit).toHaveBeenCalledWith("ужины на три дня");
  });

  it("fills the request from a task preset without submitting", () => {
    const submit = vi.fn();
    render(
      <ConversationPanel
        hasDeliveryAddress
        retailers={["lenta", "pyaterochka"]}
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

    fireEvent.click(screen.getByRole("button", { name: "Ужины на 3 дня" }));

    expect(screen.getByLabelText("Что собрать?")).toHaveValue("Ужины на 3 дня для двоих до 3000 ₽, без грибов");
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText("Опишите задачу обычными словами.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Например, ужины на 3 дня для двоих до 3000 ₽ без грибов")).toBeInTheDocument();
    expect(screen.getByText("Лента")).toBeInTheDocument();
    expect(screen.getByText("Пятёрочка")).toBeInTheDocument();
    expect(screen.queryByText("ВкусВилл")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Овощи" })).not.toBeInTheDocument();
  });

  it("shows one clarification question with person quick answers", () => {
    const intent: BasketIntent = {
      originalRequest: "ужины на три дня",
      people: 1,
      days: 3,
      meals: ["ужин"],
      budgetRub: null,
      budgetIsHard: false,
      maxCookingMinutes: null,
      excludedIngredients: [],
      dietaryRestrictions: [],
      preferences: [],
      readyFoodAllowed: true,
      priority: "balanced",
      needsClarification: true,
      clarificationQuestion: "На сколько человек собрать?",
      assumptions: [],
      searchQueries: [{ query: "ужин", purpose: "ужин", sort: "popularity" }],
    };
    const submit = vi.fn();
    render(
      <ConversationPanel
        hasDeliveryAddress
        planner={{
          state: { stage: "clarifying", messages: [], intent, variants: [], retailerResults: [], selectedId: null, error: null, catalogMode: "live", modelNames: [], pendingMessage: null },
          submit, retry: vi.fn(), reconnectCatalog: vi.fn(), mockResults: vi.fn(), createCart: vi.fn(), cancel: vi.fn(), reset: vi.fn(), replaceItem: vi.fn(), selectVariant: vi.fn(), clearVariantSelection: vi.fn(), updateItems: vi.fn(),
        } as never}
      />,
    );

    expect(screen.getByRole("heading", { name: "На сколько человек собрать?" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^(1|2|3|4\+)$/ })).toHaveLength(4);
    expect(screen.queryByRole("heading", { name: "Что собрать?" })).not.toBeInTheDocument();
  });

  it("submits a clarification quick answer once", () => {
    const submit = vi.fn();
    render(
      <ConversationPanel
        hasDeliveryAddress
        planner={{
          state: {
            stage: "clarifying", messages: [], variants: [], retailerResults: [], selectedId: null, error: null, catalogMode: "live", modelNames: [], pendingMessage: null,
            intent: { originalRequest: "ужины", people: 1, days: 3, meals: ["ужин"], budgetRub: null, budgetIsHard: false, maxCookingMinutes: null, excludedIngredients: [], dietaryRestrictions: [], preferences: [], readyFoodAllowed: true, priority: "balanced", needsClarification: true, clarificationQuestion: "На сколько человек собрать?", assumptions: [], searchQueries: [{ query: "ужин", purpose: "ужин", sort: "popularity" }] },
          },
          submit, retry: vi.fn(), reconnectCatalog: vi.fn(), mockResults: vi.fn(), createCart: vi.fn(), cancel: vi.fn(), reset: vi.fn(), replaceItem: vi.fn(), selectVariant: vi.fn(), clearVariantSelection: vi.fn(), updateItems: vi.fn(),
        } as never}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "2" }));

    expect(submit).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledWith("На 2 человека");
  });

  it("restores the pending task for editing after a generation error", () => {
    const editRequest = vi.fn();
    render(
      <ConversationPanel
        hasDeliveryAddress
        planner={{
          state: {
            stage: "error", messages: [], intent: null, variants: [], retailerResults: [], selectedId: null, catalogMode: "live", modelNames: [],
            pendingMessage: "ужины на 3 дня для двоих", error: { source: "application", code: "generation", message: "Не удалось собрать варианты.", recoverable: true },
          },
          submit: vi.fn(), retry: vi.fn(), editRequest, reconnectCatalog: vi.fn(), mockResults: vi.fn(), createCart: vi.fn(), cancel: vi.fn(), reset: vi.fn(), replaceItem: vi.fn(), selectVariant: vi.fn(), clearVariantSelection: vi.fn(), updateItems: vi.fn(),
        } as never}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Изменить запрос" }));

    expect(editRequest).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Что собрать?")).toHaveValue("ужины на 3 дня для двоих");
    expect(screen.queryByText(/HTTP|API|503/i)).not.toBeInTheDocument();
  });
});

describe("BasketResults", () => {
  afterEach(() => cleanup());

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
              makeVariant("vkusvill", "economy", "Кефир ВкусВилл"),
              makeVariant("vkusvill", "fast", "Салат ВкусВилл"),
              makeVariant("lenta", "balanced", "Молоко Лента"),
              makeVariant("lenta", "economy", "Гречка Лента"),
              makeVariant("lenta", "fast", "Курица Лента"),
              makeVariant("pyaterochka", "balanced", "Хлеб Пятёрочка"),
              makeVariant("pyaterochka", "economy", "Яйца Пятёрочка"),
              makeVariant("pyaterochka", "fast", "Сыр Пятёрочка"),
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
              makeVariant("vkusvill", "economy", "Кефир ВкусВилл"),
              makeVariant("vkusvill", "fast", "Салат ВкусВилл"),
              makeVariant("lenta", "balanced", "Молоко Лента"),
              makeVariant("lenta", "economy", "Гречка Лента"),
              makeVariant("lenta", "fast", "Курица Лента"),
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
              makeVariant("vkusvill", "economy", "Кефир ВкусВилл"),
              makeVariant("vkusvill", "fast", "Салат ВкусВилл"),
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
});

function makeVariant(retailer: NonNullable<NormalizedProduct["retailer"]>, strategy: BasketStrategy, productName: string): BasketVariant {
  const copy = strategy === "balanced"
    ? { title: "Сбалансированная", description: "баланс цены и готовки", tradeoff: "Цена и готовка в балансе." }
    : strategy === "economy"
      ? { title: "Экономная", description: "минимум стоимости", tradeoff: "Дешевле, но готовки может быть больше." }
      : { title: "Быстрая", description: "меньше готовки", tradeoff: "Дороже, зато быстрее." };
  return {
    id: `${retailer}:${strategy}`,
    retailer,
    storeId: null,
    strategy,
    title: copy.title,
    strategyDescription: copy.description,
    coverage: { people: 2, days: 3, meals: [{ type: "ужин", count: 3 }], totalMeals: 3, label: "3 ужина · 2 человека" },
    constraints: { exclusions: [], dietaryRestrictions: [], hardBudgetRub: null },
    prep: { minutes: strategy === "fast" ? 10 : strategy === "economy" ? 45 : 30, complexity: "medium", label: "готовка: средняя" },
    tradeoffSummary: copy.tradeoff,
    deltaToBalanced: { priceRub: 0 },
    score: strategy === "balanced" ? 100 : 0,
    recommended: strategy === "balanced",
    validation: { status: "not_supported", checkedAt: null },
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
