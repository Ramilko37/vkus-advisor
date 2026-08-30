export interface FoodSpriteDefinition {
  id: string;
  src: string;
  size: 32 | 40 | 48;
  x: 0 | 33.333 | 66.667 | 100;
  y: 0 | 50 | 100;
  weight?: number;
}

const sheet = "/sprites/food/food-sprites.png";

export const FOOD_SPRITES: FoodSpriteDefinition[] = [
  { id: "apple", src: sheet, size: 40, x: 0, y: 0, weight: 2 },
  { id: "milk", src: sheet, size: 48, x: 33.333, y: 0, weight: 2 },
  { id: "bread", src: sheet, size: 48, x: 66.667, y: 0 },
  { id: "tomato", src: sheet, size: 40, x: 100, y: 0 },
  { id: "cheese", src: sheet, size: 40, x: 0, y: 50 },
  { id: "broccoli", src: sheet, size: 48, x: 33.333, y: 50 },
  { id: "banana", src: sheet, size: 48, x: 66.667, y: 50 },
  { id: "yogurt", src: sheet, size: 40, x: 100, y: 50 },
  { id: "chicken", src: sheet, size: 48, x: 0, y: 100 },
  { id: "water", src: sheet, size: 48, x: 33.333, y: 100 },
  { id: "carrot", src: sheet, size: 40, x: 66.667, y: 100 },
  { id: "eggs", src: sheet, size: 48, x: 100, y: 100 },
];

const weightedSprites = FOOD_SPRITES.flatMap((sprite) => Array.from({ length: sprite.weight ?? 1 }, () => sprite));

export function pickFoodSprite(recent: string[], random = Math.random) {
  const last = recent[recent.length - 1];
  const repeatsTwice = recent.length >= 2 && last === recent[recent.length - 2];
  const available = repeatsTwice ? weightedSprites.filter((sprite) => sprite.id !== last) : weightedSprites;
  return available[Math.floor(random() * available.length)] ?? FOOD_SPRITES[0];
}
