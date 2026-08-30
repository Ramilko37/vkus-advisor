import type { RefObject } from "react";
import type { FoodSpriteDefinition } from "./foodSprites";
import { spriteStyle } from "./spriteStyle";

const slots = [
  { x: 18, y: 56, scale: 0.72 }, { x: 34, y: 52, scale: 0.82 }, { x: 52, y: 55, scale: 0.74 },
  { x: 69, y: 51, scale: 0.8 }, { x: 82, y: 57, scale: 0.7 }, { x: 26, y: 40, scale: 0.76 },
  { x: 44, y: 37, scale: 0.82 }, { x: 62, y: 39, scale: 0.75 }, { x: 76, y: 42, scale: 0.72 },
  { x: 35, y: 25, scale: 0.7 }, { x: 54, y: 23, scale: 0.76 }, { x: 68, y: 27, scale: 0.68 },
];

export function PixelBasket({ items, basketRef, bounceKey, finishing }: { items: FoodSpriteDefinition[]; basketRef: RefObject<HTMLDivElement>; bounceKey: number; finishing: boolean }) {
  return (
    <div ref={basketRef} className={`pixel-basket${finishing ? " is-finishing" : ""}`} aria-hidden="true">
      <div key={bounceKey} className={`pixel-basket__body${bounceKey ? " is-hit" : ""}`}>
        <div className="pixel-basket__layer pixel-basket__back" />
        <div className="pixel-basket__items">
          {items.slice(0, slots.length).map((sprite, index) => (
            <span
              key={`${index}-${sprite.id}`}
              className="pixel-sprite pixel-basket__item"
              style={{
                ...spriteStyle(sprite),
                left: `${slots[index].x}%`,
                top: `${slots[index].y}%`,
                transform: `translate(-50%, -50%) scale(${slots[index].scale})`,
              }}
            />
          ))}
        </div>
        <div className="pixel-basket__layer pixel-basket__front" />
      </div>
    </div>
  );
}
