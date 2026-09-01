import { describe, expect, it } from "vitest";
import { formatDeliveryAddress } from "./addressPresentation";

describe("formatDeliveryAddress", () => {
  it("formats a DaData-style Moscow address", () => {
    expect(formatDeliveryAddress("г Москва, ул Краснобогатырская, д 90, стр 2"))
      .toBe("Краснобогатырская, 90с2");
  });

  it("keeps a readable fallback", () => {
    expect(formatDeliveryAddress("Москва, Вавилова 19")).toBe("Вавилова 19");
  });

  it("returns null for an empty address", () => {
    expect(formatDeliveryAddress("   ")).toBeNull();
  });
});
