import { useCallback, useEffect, useRef, useState, type CSSProperties, type MutableRefObject, type RefObject } from "react";
import type { WorkflowStage } from "../../types/domain";
import { pickFoodSprite, type FoodSpriteDefinition } from "./foodSprites";
import { BASKET_SLOTS, MAX_FALLING_SPRITES, spawnKind, stageFillCap } from "./loaderModel";
import { spriteStyle } from "./spriteStyle";

interface FallingFood {
  id: number;
  kind: "catch" | "miss";
  edge: boolean;
  sprite: FoodSpriteDefinition;
  size: number;
  style: CSSProperties & Record<`--${string}`, string>;
}

export function FoodRain({ stage, finishing, landedCount, basketRef, onLand }: { stage: WorkflowStage; finishing: boolean; landedCount: number; basketRef: RefObject<HTMLDivElement>; onLand: (sprite: FoodSpriteDefinition) => void }) {
  const [falling, setFalling] = useState<FallingFood[]>([]);
  const fallingRef = useRef(falling);
  const landedRef = useRef(landedCount);
  const stageRef = useRef(stage);
  const recentRef = useRef<string[]>([]);
  const sequenceRef = useRef(0);
  fallingRef.current = falling;
  landedRef.current = landedCount;
  stageRef.current = stage;

  const addFlight = useCallback((kind: "catch" | "miss", fast = false) => {
    setFalling((current) => current.length >= MAX_FALLING_SPRITES ? current : [...current, createFlight(kind, fast, basketRef, recentRef, sequenceRef)]);
  }, [basketRef]);

  useEffect(() => {
    if (finishing) return;
    let timeout: number | undefined;
    const schedule = () => {
      timeout = window.setTimeout(() => {
        timeout = undefined;
        if (document.visibilityState === "hidden") return;
        const index = sequenceRef.current + 1;
        addFlight(spawnKind(stageRef.current, landedRef.current, index));
        schedule();
      }, randomBetween(500, 750));
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && timeout === undefined) schedule();
      if (document.visibilityState === "hidden" && timeout !== undefined) {
        window.clearTimeout(timeout);
        timeout = undefined;
      }
    };
    schedule();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [addFlight, finishing]);

  useEffect(() => {
    if (!finishing) return;
    setFalling([]);
    const timeouts = Array.from({ length: Math.min(MAX_FALLING_SPRITES, BASKET_SLOTS - landedRef.current) }, (_, index) => (
      window.setTimeout(() => addFlight("catch", true), index * 45)
    ));
    return () => timeouts.forEach((timeout) => window.clearTimeout(timeout));
  }, [addFlight, finishing]);

  const finishFlight = (item: FallingFood) => {
    setFalling((current) => current.filter((candidate) => candidate.id !== item.id));
    if (item.kind === "catch" && landedRef.current < stageFillCap(stageRef.current)) onLand(item.sprite);
  };

  return (
    <div className="food-rain-layer" aria-label="Падающие продукты" aria-hidden="true">
      {falling.map((item) => (
        <span
          key={item.id}
          data-flight={item.kind}
          className={`pixel-sprite falling-food is-${item.kind}${item.edge ? " is-edge-hit" : ""}`}
          style={{ ...spriteStyle(item.sprite, item.size), ...item.style }}
          onAnimationEnd={() => finishFlight(item)}
        />
      ))}
    </div>
  );
}

function createFlight(kind: "catch" | "miss", fast: boolean, basketRef: RefObject<HTMLDivElement>, recentRef: MutableRefObject<string[]>, sequenceRef: MutableRefObject<number>): FallingFood {
  const sprite = pickFoodSprite(recentRef.current);
  recentRef.current = [...recentRef.current.slice(-1), sprite.id];
  const id = ++sequenceRef.current;
  const mobile = window.innerWidth < 600;
  const size = mobile && sprite.size === 48 ? 40 : sprite.size;
  const fromLeft = Math.random() < 0.5;
  const startX = window.innerWidth * randomBetween(fromLeft ? 0.12 : 0.75, fromLeft ? 0.25 : 0.88);
  const basket = basketRef.current?.getBoundingClientRect();
  const targetX = (basket?.left ?? window.innerWidth * 0.5 - 70) + (basket?.width ?? 140) * 0.5 - size * 0.5;
  const targetY = (basket?.top ?? window.innerHeight * 0.74) + (basket?.height ?? 140) * 0.32 - size * 0.5;
  const endX = kind === "catch" ? targetX : startX + randomBetween(-90, 90);
  const endY = kind === "catch" ? targetY : window.innerHeight + size + 24;
  const midX = kind === "catch" ? startX + (targetX - startX) * 0.14 : startX + (endX - startX) * 0.6;
  const midY = kind === "catch" ? Math.max(80, targetY - 120) : window.innerHeight * 0.62;
  const duration = fast ? randomBetween(280, 380) : randomBetween(1600, 2500);

  return {
    id,
    kind,
    edge: kind === "miss" && Math.random() < 0.08,
    sprite,
    size,
    style: {
      "--start-x": `${Math.round(startX)}px`,
      "--mid-x": `${Math.round(midX)}px`,
      "--mid-y": `${Math.round(midY)}px`,
      "--end-x": `${Math.round(endX)}px`,
      "--end-y": `${Math.round(endY)}px`,
      "--flight-duration": `${Math.round(duration)}ms`,
      "--spin": `${Math.round(randomBetween(-70, 70))}deg`,
    },
  };
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}
