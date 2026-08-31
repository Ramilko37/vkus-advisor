import type { CSSProperties } from "react";
import type { FoodSpriteDefinition } from "./foodSprites";

export const FOOD_SPRITE_SCALE = 2.5;

export function spriteStyle(sprite: FoodSpriteDefinition, size: number = sprite.size * FOOD_SPRITE_SCALE): CSSProperties {
  return {
    width: size,
    height: size,
    backgroundImage: `url(${sprite.src})`,
    backgroundPosition: `${sprite.x}% ${sprite.y}%`,
    backgroundSize: "400% 300%",
  };
}
