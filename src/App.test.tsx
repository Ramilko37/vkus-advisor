import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { saveOnboardingState } from "./services/onboardingRepository";
import { DEFAULT_PROFILE } from "./services/profileRepository";

const mocks = vi.hoisted(() => ({
  authProfile: vi.fn(),
  basketPlanner: vi.fn(),
  resolveDeliveryContext: vi.fn(),
  submit: vi.fn(),
  updateProfile: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("./hooks/useAuthProfile", () => ({ useAuthProfile: mocks.authProfile }));
vi.mock("./hooks/useBasketPlanner", () => ({ useBasketPlanner: mocks.basketPlanner }));
vi.mock("./services/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./services/catalog")>()),
  resolveDeliveryContext: mocks.resolveDeliveryContext,
}));
vi.mock("./services/webMcpTools", () => ({ registerWebMcpTools: vi.fn() }));

describe("App address-first entry", () => {
  let profile = DEFAULT_PROFILE;

  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
    profile = DEFAULT_PROFILE;
    mocks.submit.mockReset();
    mocks.updateProfile.mockReset();
    mocks.reset.mockReset();
    mocks.resolveDeliveryContext.mockResolvedValue({
      status: "ready",
      address: "г Москва, ул Тверская, д 1",
      retailers: ["lenta"],
      lentaStore: { id: "525", name: "Лента", address: "Москва, Овчинниковская наб., 22/24с1" },
    });
    mocks.authProfile.mockImplementation(() => ({
      authConfigured: false,
      authError: null,
      authStatus: "guest",
      profile,
      sendOtp: vi.fn(),
      signOut: vi.fn(),
      updateProfile: (next: typeof DEFAULT_PROFILE) => {
        profile = next;
        mocks.updateProfile(next);
      },
      user: null,
    }));
    mocks.basketPlanner.mockReturnValue(makePlanner());
  });

  afterEach(() => cleanup());

  it("blocks Home with the address gate on first launch", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Куда доставить продукты?" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Что собрать?" })).not.toBeInTheDocument();
  });

  it("skips the gate when a valid saved address and store context exist", () => {
    profile = { ...DEFAULT_PROFILE, address: "г Москва, ул Тверская, д 1", lentaStoreId: "525", lentaStoreName: "Лента" };

    render(<App />);

    expect(screen.queryByRole("dialog", { name: "Адрес доставки" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Что собрать?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Адрес доставки: г Москва, ул Тверская, д 1" })).toBeInTheDocument();
    expect(mocks.basketPlanner).toHaveBeenLastCalledWith(profile, ["lenta"]);
  });

  it("blocks Home while the authenticated profile is loading", () => {
    mocks.authProfile.mockReturnValue({ ...mocks.authProfile(), authStatus: "loading" });

    render(<App />);

    expect(screen.getByRole("status")).toHaveTextContent("Загружаем адрес…");
    expect(screen.queryByRole("textbox", { name: "Что собрать?" })).not.toBeInTheDocument();
  });

  it("does not reuse a partial-retailer resolution from a different address", () => {
    saveOnboardingState({
      version: 1,
      status: "completed",
      step: "profile",
      requestDraft: "",
      resolvedAddress: "г Москва, ул Старая, д 1",
      resolvedRetailers: ["pyaterochka"],
      resultsHintDismissed: false,
      basketEditHintDismissed: false,
    });
    profile = { ...DEFAULT_PROFILE, address: "г Москва, ул Новая, д 2" };

    render(<App />);

    expect(screen.getByRole("dialog", { name: "Адрес доставки" })).toBeInTheDocument();
  });

  it("enters Home only after retailer resolution finishes", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Адрес"), { target: { value: "Москва, Тверская 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Адрес доставки" })).not.toBeInTheDocument());
    expect(mocks.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ address: "г Москва, ул Тверская, д 1", lentaStoreId: "525" }));
  });

  it("opens the same flow from the Home address and resets the old basket context", async () => {
    profile = { ...DEFAULT_PROFILE, address: "г Москва, ул Старая, д 1", lentaStoreId: "111", lentaStoreName: "Старая Лента" };
    mocks.resolveDeliveryContext.mockResolvedValue({
      status: "ready",
      address: "г Москва, ул Новая, д 2",
      retailers: ["pyaterochka"],
    });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Адрес доставки: г Москва, ул Старая, д 1" }));
    fireEvent.change(screen.getByLabelText("Адрес"), { target: { value: "Москва, Новая 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));

    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ address: "г Москва, ул Новая, д 2" })));
    expect(mocks.updateProfile).toHaveBeenCalledWith(expect.not.objectContaining({ lentaStoreId: expect.anything() }));
    expect(mocks.reset).toHaveBeenCalledOnce();
  });

  it("starts a new search from results without redirecting back to the old basket", () => {
    profile = { ...DEFAULT_PROFILE, address: "г Москва, ул Тверская, д 1", lentaStoreId: "525" };
    window.history.replaceState(null, "", "/results");
    const planner = makePlanner();
    planner.state = {
      ...planner.state,
      stage: "ready",
      variants: [{
        id: "vkusvill:balanced", retailer: "vkusvill", strategy: "balanced",
        storeId: null, title: "Сбалансированная", strategyDescription: "баланс цены и готовки",
        coverage: { people: 1, days: 1, meals: [{ type: "ужин", count: 1 }], totalMeals: 1, label: "1 ужин · 1 человек" },
        constraints: { exclusions: [], dietaryRestrictions: [], hardBudgetRub: null },
        prep: { minutes: 30, complexity: "medium", label: "готовка: средняя" },
        tradeoffSummary: "Цена и готовка в балансе.", deltaToBalanced: { priceRub: 0 },
        score: 100, recommended: true, validation: { status: "not_supported", checkedAt: null }, items: [],
        totalRub: 100, uniqueItemsCount: 0, warnings: [],
      }],
    } as never;
    planner.reset.mockImplementation(() => { planner.state = makePlanner().state; });
    mocks.basketPlanner.mockImplementation(() => planner);

    render(<App />);
    fireEvent.click(screen.getByRole("link", { name: "На главную" }));

    expect(window.location.pathname).toBe("/");
    expect(screen.getByLabelText("Что собрать?")).toBeInTheDocument();
  });
});

function makePlanner() {
  return {
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
    submit: mocks.submit,
    retry: vi.fn(),
    reconnectCatalog: vi.fn(),
    mockResults: vi.fn(),
    createCart: vi.fn(),
    cancel: vi.fn(),
    reset: mocks.reset,
    replaceItem: vi.fn(),
    selectVariant: vi.fn(),
    clearVariantSelection: vi.fn(),
    updateItems: vi.fn(),
  };
}
