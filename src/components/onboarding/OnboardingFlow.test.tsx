import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROFILE } from "../../services/profileRepository";
import { OnboardingFlow } from "./OnboardingFlow";

const mocks = vi.hoisted(() => ({
  resolveDeliveryContext: vi.fn(),
  suggestAddresses: vi.fn(),
  reverseGeocodeAddress: vi.fn(),
}));

vi.mock("../../services/catalog", () => ({
  resolveDeliveryContext: mocks.resolveDeliveryContext,
  suggestAddresses: mocks.suggestAddresses,
  reverseGeocodeAddress: mocks.reverseGeocodeAddress,
}));

describe("address-first flow", () => {
  beforeEach(() => {
    mocks.resolveDeliveryContext.mockResolvedValue({
      status: "ready",
      address: "г Москва, ул Тверская, д 1",
      retailers: ["vkusvill", "lenta"],
      lentaStore: { id: "525", name: "Лента", address: "Овчинниковская наб., 22/24с1" },
    });
    mocks.suggestAddresses.mockResolvedValue([]);
    mocks.reverseGeocodeAddress.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
  });

  it("starts with the mandatory address gate and exact product copy", () => {
    render(<OnboardingFlow profile={DEFAULT_PROFILE} onProfileChange={vi.fn()} onComplete={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Куда доставить продукты?" })).toBeInTheDocument();
    expect(screen.getByText("Адрес нужен, чтобы искать товары и цены в магазинах рядом с вами.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Использовать геопозицию" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Продолжить" })).toBeDisabled();
    expect(screen.queryByText("Соберём покупки вместо вас")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Пропустить настройку" })).not.toBeInTheDocument();
  });

  it("resolves stores only after confirmation and saves normalized context", async () => {
    const onProfileChange = vi.fn();
    const onComplete = vi.fn();
    let finishResolution!: (value: unknown) => void;
    mocks.resolveDeliveryContext.mockImplementation(() => new Promise((resolve) => { finishResolution = resolve; }));
    render(<OnboardingFlow profile={DEFAULT_PROFILE} onProfileChange={onProfileChange} onComplete={onComplete} />);

    fireEvent.change(screen.getByLabelText("Адрес"), { target: { value: "Москва, Тверская 1" } });
    expect(mocks.resolveDeliveryContext).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));

    expect(screen.getByText("Ищем магазины рядом…")).toBeInTheDocument();
    finishResolution({
      status: "ready",
      address: "г Москва, ул Тверская, д 1",
      retailers: ["vkusvill", "lenta"],
      lentaStore: { id: "525", name: "Лента", address: "Овчинниковская наб., 22/24с1" },
    });

    await waitFor(() => expect(onProfileChange).toHaveBeenCalledWith(expect.objectContaining({
      address: "г Москва, ул Тверская, д 1",
      lentaStoreId: "525",
    })));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ lentaStoreId: "525" }), ["vkusvill", "lenta"]);
  });

  it("shows the exact address-not-found state", async () => {
    mocks.resolveDeliveryContext.mockResolvedValue({ status: "address_not_found" });
    render(<OnboardingFlow profile={DEFAULT_PROFILE} onProfileChange={vi.fn()} onComplete={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Адрес"), { target: { value: "Москва, Неверная 999" } });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));

    expect(await screen.findByText("Не нашли этот адрес. Проверьте написание или укажите другой.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Продолжить" })).toBeEnabled();
  });

  it("shows the exact unavailable state when no retailer can serve the address", async () => {
    mocks.resolveDeliveryContext.mockResolvedValue({ status: "no_retailers", address: "Москва, Тверская 1", retailers: [] });
    render(<OnboardingFlow profile={DEFAULT_PROFILE} onProfileChange={vi.fn()} onComplete={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Адрес"), { target: { value: "Москва, Тверская 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));

    expect(await screen.findByText("Пока не нашли магазины, с которыми умеем работать по этому адресу.")).toBeInTheDocument();
  });

  it("allows partial availability without inventing a Lenta store", async () => {
    const onComplete = vi.fn();
    mocks.resolveDeliveryContext.mockResolvedValue({
      status: "ready",
      address: "г Москва, ул Тверская, д 1",
      retailers: ["vkusvill"],
    });
    render(<OnboardingFlow profile={{ ...DEFAULT_PROFILE, lentaStoreId: "old" }} onProfileChange={vi.fn()} onComplete={onComplete} />);

    fireEvent.change(screen.getByLabelText("Адрес"), { target: { value: "Москва, Тверская 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(expect.not.objectContaining({ lentaStoreId: expect.anything() }), ["vkusvill"]));
  });

  it("keeps manual input available when geolocation is denied", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((_success: PositionCallback, error: PositionErrorCallback) => error({ code: 1 } as GeolocationPositionError)),
      },
    });
    render(<OnboardingFlow profile={DEFAULT_PROFILE} onProfileChange={vi.fn()} onComplete={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Использовать геопозицию" }));

    expect(await screen.findByText("Доступ к геопозиции запрещён — введите адрес вручную.")).toBeInTheDocument();
    expect(screen.getByLabelText("Адрес")).toBeEnabled();
  });

  it("ignores an obsolete resolution after the address changes", async () => {
    const onProfileChange = vi.fn();
    let finishResolution!: (value: unknown) => void;
    mocks.resolveDeliveryContext.mockImplementation(() => new Promise((resolve) => { finishResolution = resolve; }));
    render(<OnboardingFlow profile={DEFAULT_PROFILE} onProfileChange={onProfileChange} onComplete={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Адрес"), { target: { value: "Москва, Старая 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));
    fireEvent.change(screen.getByLabelText("Адрес"), { target: { value: "Москва, Новая 2" } });
    finishResolution({ status: "ready", address: "г Москва, ул Старая, д 1", retailers: ["lenta"], lentaStore: { id: "old" } });

    await waitFor(() => expect(screen.getByLabelText("Адрес")).toHaveValue("Москва, Новая 2"));
    expect(onProfileChange).not.toHaveBeenCalled();
  });
});
