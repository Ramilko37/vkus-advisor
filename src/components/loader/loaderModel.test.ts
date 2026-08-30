import { describe, expect, it } from "vitest";
import { pickFoodSprite } from "./foodSprites";
import { spawnKind, stageFillCap } from "./loaderModel";

describe("loaderModel", () => {
  it("caps basket fill by the real workflow stage", () => {
    expect(stageFillCap("analyzing")).toBe(2);
    expect(stageFillCap("searching")).toBe(7);
    expect(stageFillCap("composing")).toBe(10);
    expect(stageFillCap("ready")).toBe(12);
  });

  it("forces misses at the stage cap and regularly while there is room", () => {
    const catchRandom = () => 0;

    expect(spawnKind("analyzing", 2, 1, catchRandom)).toBe("miss");
    expect(spawnKind("searching", 0, 3, catchRandom)).toBe("miss");
    expect(spawnKind("searching", 0, 1, catchRandom)).toBe("catch");
  });

  it("does not select the same food three times in a row", () => {
    expect(pickFoodSprite(["apple", "apple"], () => 0).id).not.toBe("apple");
  });
});
