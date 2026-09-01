import indexHtml from "../../index.html?raw";
import { describe, expect, it } from "vitest";
import { BRAND } from "./brand";

describe("BRAND", () => {
  it("uses a neutral consumer-facing name", () => {
    expect(BRAND.name).toBe("Умная корзина");
    expect(BRAND.title).toContain("Умная корзина");
    expect(BRAND.title).not.toContain("ВкусВилл Advisor");
    expect(BRAND.description).toContain("три");
  });

  it("states that the service is independent", () => {
    expect(BRAND.independentNote).toContain("Независимый");
    expect(BRAND.independentNote).toContain("не является официальным");
  });

  it("uses neutral document metadata", () => {
    expect(indexHtml).toContain("Умная корзина");
    expect(indexHtml).toContain('property="og:image"');
    expect(indexHtml).toContain('rel="manifest"');
    expect(indexHtml).not.toContain("ВкусВилл Advisor");
  });
});
