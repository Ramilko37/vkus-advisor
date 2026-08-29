import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROFILE } from "../services/profileRepository";
import { useBasketPlanner } from "./useBasketPlanner";

const mocks = vi.hoisted(() => ({
  createCatalogClient: vi.fn(),
}));

vi.mock("../services/catalog", () => ({
  createCatalogClient: mocks.createCatalogClient,
}));

describe("useBasketPlanner profile", () => {
  afterEach(() => {
    mocks.createCatalogClient.mockReset();
    sessionStorage.clear();
  });

  it("passes the current profile to catalog reconnect", async () => {
    const profile = { ...DEFAULT_PROFILE, address: "Москва, Вавилова 19" };
    mocks.createCatalogClient.mockResolvedValue({
      mode: "live",
      searchProducts: vi.fn(),
      getProductDetails: vi.fn(),
      createCartLink: vi.fn(),
    });

    const { result } = renderHook(() => useBasketPlanner(profile));

    await act(async () => {
      await result.current.reconnectCatalog();
    });

    expect(mocks.createCatalogClient).toHaveBeenCalledWith(profile);
  });
});
