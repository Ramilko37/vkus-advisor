import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { saveOnboardingState } from "./services/onboardingRepository";
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
    fireEvent.click(screen.getByRole("button", { name: "Пропустить настройку" }));

    expect(screen.getByLabelText("Что собрать?")).toBeInTheDocument();
    firstVisit.unmount();

    render(<App />);
    expect(screen.queryByRole("dialog", { name: "Первоначальная настройка" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Показать онбординг" })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Пропустить настройку" }));

    fireEvent.click(screen.getByRole("button", { name: "Показать онбординг" }));

    expect(screen.getByRole("heading", { name: "Соберём покупки вместо вас" })).toBeInTheDocument();
  });

  it("resumes the persisted unfinished step", () => {
    saveOnboardingState({
      version: 1,
      status: "in_progress",
      step: "profile",
      requestDraft: "",
      resultsHintDismissed: false,
      basketEditHintDismissed: false,
    });

    render(<App />);

    expect(screen.getByRole("heading", { name: "Что учитывать в ваших корзинах?" })).toBeInTheDocument();
  });

  it("preserves a Home request through required delivery setup", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Пропустить настройку" }));
    fireEvent.change(screen.getByLabelText("Что собрать?"), { target: { value: "ужины на три дня" } });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));

    expect(screen.getByRole("heading", { name: "Где вы покупаете продукты?" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Адрес"), { target: { value: "Москва, Вавилова 19" } });
    expect(await screen.findByText("Не нашли подходящий магазин для этого адреса")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Продолжить без Ленты" }));
    fireEvent.click(screen.getByRole("button", { name: "Пропустить" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Первоначальная настройка" })).not.toBeInTheDocument());
    expect(screen.getByLabelText("Что собрать?")).toHaveValue("ужины на три дня");
    fireEvent.click(screen.getByRole("button", { name: "Подобрать 3 корзины" }));
    expect(mocks.submit).toHaveBeenCalledWith("ужины на три дня");
  });

  it("starts a new search from results without redirecting back to the old basket", () => {
    saveOnboardingState({
      version: 1, status: "dismissed", step: "value", requestDraft: "",
      resultsHintDismissed: true, basketEditHintDismissed: true,
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
    reset: vi.fn(),
    replaceItem: vi.fn(),
    selectVariant: vi.fn(),
    clearVariantSelection: vi.fn(),
    updateItems: vi.fn(),
  };
}
