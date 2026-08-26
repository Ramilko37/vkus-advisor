import { describe, expect, it } from "vitest";
import {
  extractCartUrl,
  extractJsonFromText,
  normalizeSearchProduct,
  parseMcpResponse,
} from "./mcpParsing";

describe("MCP parsing", () => {
  it("extracts balanced JSON embedded in SSE text", () => {
    const result = parseMcpResponse('event: message\ndata: {"content":[{"text":"```json\\n{\\"items\\":[{\\"xml_id\\":\\"101\\",\\"name\\":\\"Гречка\\",\\"price\\":129}]}\\n```"}]}');
    expect(result).toEqual({ items: [{ xml_id: "101", name: "Гречка", price: 129 }] });
  });

  it("extracts a cart URL only from vkusvill HTTPS hosts", () => {
    expect(extractCartUrl({ url: "https://vkusvill.ru/cart/shared/abc" })).toBe("https://vkusvill.ru/cart/shared/abc");
    expect(extractCartUrl({ url: "http://vkusvill.ru/cart/shared/abc" })).toBeNull();
  });

  it("normalizes product cards without leaking raw responses", () => {
    const product = normalizeSearchProduct({ xml_id: 42, title: "Творог", price: "98 ₽", rating: "4.8" }, "творог", false);
    if (!product) throw new Error("product should normalize");
    expect(product).toMatchObject({ xmlId: "42", name: "Творог", priceRub: 98, rating: 4.8, sourceQuery: "творог" });
    expect(Object.keys(product)).not.toContain("raw");
  });

  it("normalizes nested VkusVill MCP product shape", () => {
    const product = normalizeSearchProduct({
      id: 17699,
      xml_id: 17699,
      name: "Крупа гречневая ядрица, 900&nbsp;г",
      price: { current: 82, old: 99 },
      rating: { average: 4.9, count: 55968 },
      properties: [{ name: "Состав", value: "крупа гречневая<br>" }],
    }, "гречка", false);

    expect(product).toMatchObject({
      xmlId: "17699",
      priceRub: 82,
      oldPriceRub: 99,
      rating: 4.9,
      reviewsCount: 55968,
      composition: "крупа гречневая",
    });
  });

  it("returns null when text has no JSON", () => {
    expect(extractJsonFromText("plain text")).toBeNull();
  });
});
