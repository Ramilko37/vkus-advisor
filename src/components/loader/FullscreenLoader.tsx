import { useCallback, useEffect, useRef, useState } from "react";
import type { BasketIntent, WorkflowStage } from "../../types/domain";
import { summarizeIntentSlots } from "../../services/requestCopy";
import { FoodRain } from "./FoodRain";
import { FOOD_SPRITES, type FoodSpriteDefinition } from "./foodSprites";
import { BASKET_SLOTS, stageFillCap } from "./loaderModel";
import { PixelBasket } from "./PixelBasket";
import { usePrefersReducedMotion } from "./useLoaderVisualState";
import "./fullscreen-loader.css";

const steps: Array<{ id: WorkflowStage; title: string; text: string }> = [
  { id: "analyzing", title: "Запрос", text: "Выделяем дни, бюджет и ограничения" },
  { id: "searching", title: "Каталог", text: "Ищем подходящие товары" },
  { id: "composing", title: "Варианты", text: "Сравниваем три корзины" },
];

export function FullscreenLoader({ stage, intent, onCancel, finishing = false }: { stage: WorkflowStage; intent: BasketIntent | null; onCancel: () => void; finishing?: boolean }) {
  const reducedMotion = usePrefersReducedMotion();
  const [landed, setLanded] = useState<FoodSpriteDefinition[]>([]);
  const [bounceKey, setBounceKey] = useState(0);
  const basketRef = useRef<HTMLDivElement>(null);
  const cap = stageFillCap(stage);

  const land = useCallback((sprite: FoodSpriteDefinition) => {
    setLanded((current) => current.length >= stageFillCap(stage) ? current : [...current, sprite]);
    setBounceKey((value) => value + 1);
  }, [stage]);

  useEffect(() => {
    if (!reducedMotion) return;
    setLanded((current) => fillTo(current, cap));
  }, [cap, reducedMotion]);

  useEffect(() => {
    if (!finishing) return;
    const timeout = window.setTimeout(() => {
      setLanded((current) => fillTo(current, BASKET_SLOTS));
      setBounceKey((value) => value + 1);
    }, 520);
    return () => window.clearTimeout(timeout);
  }, [finishing]);

  const activeIndex = stage === "ready" ? steps.length : Math.max(0, steps.findIndex((step) => step.id === stage));

  return (
    <div className={`liquid-loader-backdrop${finishing ? " is-finishing" : ""}`} role="status" aria-live="polite" aria-busy="true">
      {!reducedMotion && <FoodRain stage={stage} finishing={finishing} landedCount={landed.length} basketRef={basketRef} onLand={land} />}
      <PixelBasket items={landed} basketRef={basketRef} bounceKey={bounceKey} finishing={finishing} />
      <section className="liquid-loader-card liquid-glass" aria-label="Прогресс подбора">
        <h2>{stage === "creatingCart" ? "Готовим ссылку на корзину" : "Подбираем корзину"}</h2>
        {intent && (
          <div className="loader-slots" aria-label="Параметры запроса">
            {summarizeIntentSlots(intent).map((slot) => <span key={slot}>{slot}</span>)}
          </div>
        )}
        <ol className="loader-steps">
          {steps.map((step, index) => (
            <li key={step.id} className={index < activeIndex ? "done" : index === activeIndex ? "current" : ""}>
              <span aria-hidden="true">{index < activeIndex ? "✓" : index + 1}</span>
              <div><strong>{step.title}</strong><small>{step.text}</small></div>
            </li>
          ))}
        </ol>
        {!finishing && <button className="secondary-button" type="button" onClick={onCancel}>Отменить</button>}
      </section>
    </div>
  );
}

function fillTo(current: FoodSpriteDefinition[], count: number) {
  if (current.length >= count) return current;
  return [...current, ...Array.from({ length: count - current.length }, (_, index) => FOOD_SPRITES[(current.length + index) % FOOD_SPRITES.length])];
}
