import { describe, expect, it } from "vitest";
import { RETAILERS } from "./retailers";

describe("RETAILERS", () => {
  it("treats retailers as sources rather than product brands", () => {
    expect(RETAILERS.vkusvill.label).toBe("ВкусВилл");
    expect(RETAILERS.lenta.label).toBe("Лента");
    expect(RETAILERS.pyaterochka.label).toBe("Пятёрочка");
  });

  it("does not claim automatic checkout where the current product only supports a list", () => {
    expect(RETAILERS.vkusvill.capability).toBe("auto-cart");
    expect(RETAILERS.lenta.capability).toBe("manual-list");
    expect(RETAILERS.pyaterochka.capability).toBe("manual-list");
  });
});
