import type { CSSProperties } from "react";
import type { FoodSpriteDefinition } from "./foodSprites";

export function spriteStyle(sprite: FoodSpriteDefinition, size: number = sprite.size): CSSProperties {
  return {
    width: size,
    height: size,
    backgroundImage: `url(${sprite.src})`,
    backgroundPosition: `${sprite.x}% ${sprite.y}%`,
    backgroundSize: "400% 300%",
  };
}
