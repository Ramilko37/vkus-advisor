import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { createInitialOnboardingState, saveOnboardingState, ONBOARDING_STORAGE_KEY } from "./services/onboardingRepository";
import { DEFAULT_PROFILE } from "./services/profileRepository";

const mocks = vi.hoisted(() => ({
  authProfile: vi.fn(),
  basketPlanner: vi.fn(),
  findLentaStores: vi.fn(),
  submit: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock("./hooks/useAuthProfile", () => ({ useAuthProfile: mocks.authProfile }));
vi.mock("./hooks/useBasketPlanner", () => ({ useBasketPlanner: mocks.basketPlanner }));
vi.mock("./services/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./services/catalog")>()),
  findLentaStores: mocks.findLentaStores,
}));
vi.mock("./services/webMcpTools", () => ({ registerWebMcpTools: vi.fn() }));

describe("App first-run onboarding", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
    mocks.submit.mockReset();
    mocks.updateProfile.mockReset();
    mocks.findLentaStores.mockResolvedValue([]);
    let profile = DEFAULT_PROFILE;
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

  it("shows onboarding on the first visit and does not open it automatically again", () => {
    const firstVisit = render(<App />);

    expect(screen.getByRole("heading", { name: "Соберём покупки вместо вас" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Попробовать" }));

    expect(screen.getByLabelText("Что собрать?")).toBeInTheDocument();
    expect(screen.getByText("Умная корзина")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Что нужно купить?" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Поиск" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Основная навигация" })).not.toBeInTheDocument();
    expect(screen.queryByText("Молочное")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Адрес не указан.*Добавить/i })).toBeInTheDocument();
    expect(screen.getByText(/Независимый экспериментальный сервис/)).toBeInTheDocument();
    firstVisit.unmount();

    render(<App />);
    expect(screen.queryByRole("dialog", { name: "Первоначальная настройка" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Как это работает" })).toBeInTheDocument();
  });


  it("shows the saved delivery address in the utility topbar", () => {
    saveOnboardingState({
      ...createInitialOnboardingState(),
      status: "completed",
    });
    mocks.authProfile.mockReturnValue({
      ...mocks.authProfile(),
      profile: {
        ...DEFAULT_PROFILE,
        address: "г Москва, ул Краснобогатырская, д 90, стр 2",
      },
    });

    render(<App />);

    expect(screen.getByRole("button", { name: /Краснобогатырская, 90с2/ })).toBeInTheDocument();
  });

  it("keeps a typed request when delivery settings are opened from the topbar", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Попробовать" }));
    fireEvent.change(screen.getByLabelText("Что собрать?"), { target: { value: "ужины для двоих без грибов" } });

    fireEvent.click(screen.getByRole("button", { name: /Адрес не указан.*Добавить/i }));
    expect(screen.getByRole("heading", { name: "Куда доставить продукты?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));

    expect(screen.getByLabelText("Что собрать?")).toHaveValue("ужины для двоих без грибов");
  });

  it("shows onboarding on the first visit even when the profile already has an address", () => {
    mocks.authProfile.mockReturnValue({
      ...mocks.authProfile(),
      profile: { ...DEFAULT_PROFILE, address: "Москва, Тверская 1" },
    });

    render(<App />);

    expect(screen.getByRole("dialog", { name: "Первоначальная настройка" })).toBeInTheDocument();
  });

  it("keeps a button that opens onboarding again after it was dismissed", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Попробовать" }));

    fireEvent.click(screen.getByRole("button", { name: "Как это работает" }));

    expect(screen.getByRole("heading", { name: "Соберём покупки вместо вас" })).toBeInTheDocument();
  });

  it("migrates the removed profile step without reopening onboarding", () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({
      version: 1,
      status: "in_progress",
      step: "profile",
      requestDraft: "",
      resultsHintDismissed: false,
      basketEditHintDismissed: false,
    }));

    render(<App />);

    expect(screen.queryByRole("dialog", { name: "Первоначальная настройка" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Что собрать?")).toBeInTheDocument();
  });

  it("preserves a Home request through required delivery setup", async () => {
    mocks.findLentaStores.mockResolvedValue([
      { id: "525", name: "ТК1453", address: "Москва, Овчинниковская наб., 22/24с1", distanceMeters: 1127 },
    ]);
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Попробовать" }));
    fireEvent.change(screen.getByLabelText("Что собрать?"), { target: { value: "ужины на три дня" } });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));

    expect(screen.getByRole("heading", { name: "Куда доставить продукты?" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Адрес"), { target: { value: "Москва, Вавилова 19" } });
    expect(await screen.findByText("ТК1453, Москва, Овчинниковская наб., 22/24с1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Первоначальная настройка" })).not.toBeInTheDocument());
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith(
      "ужины на три дня",
      expect.objectContaining({ address: "Москва, Вавилова 19", lentaStoreId: "525" }),
    ));
  });

  it("starts a new search from results without redirecting back to the old basket", () => {
    saveOnboardingState({
      ...createInitialOnboardingState(),
      status: "dismissed",
      resultsHintDismissed: true,
      basketEditHintDismissed: true,
    });
    window.history.replaceState(null, "", "/results");
    const planner = makePlanner();
    planner.state = {
      ...planner.state,
      stage: "ready",
      variants: [{
        id: "vkusvill:balanced", retailer: "vkusvill", strategy: "balanced",
        title: "Сбалансированная", summary: "Баланс", tradeoffs: [], items: [],
        totalRub: 100, uniqueItemsCount: 0, warnings: [],
      }],
    } as never;
    planner.reset.mockImplementation(() => { planner.state = makePlanner().state; });
    mocks.basketPlanner.mockImplementation(() => planner);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Новый запрос" }));

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
    reset: vi.fn(),
    replaceItem: vi.fn(),
    selectVariant: vi.fn(),
    clearVariantSelection: vi.fn(),
    updateItems: vi.fn(),
  };
}
