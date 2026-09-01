import type { BasketIntent } from "../types/domain";

const mealTitles: Record<string, string> = {
  завтрак: "Завтраки",
  обед: "Обеды",
  ужин: "Ужины",
};

export function validateBasketRequest(message: string): string | null {
  const words = message.trim().split(/\s+/).filter(Boolean);
  if (message.trim().length < 8 || words.length < 3) return "Добавьте детали: срок, людей, бюджет или ограничения.";
  return null;
}

export function summarizeIntentSlots(intent: BasketIntent): string[] {
  return [
    `${intent.people} чел.`,
    `${intent.days} ${pluralizeDay(intent.days)}`,
    intent.budgetRub ? `до ${formatRub(intent.budgetRub)} ₽` : "",
    ...intent.excludedIngredients.map((item) => `без ${item}`),
    ...intent.meals,
  ].filter(Boolean).slice(0, 6);
}

export function summarizeIntentTitle(intent: BasketIntent) {
  const title = intent.meals.length === 1
    ? mealTitles[intent.meals[0].toLocaleLowerCase("ru-RU")] ?? capitalize(intent.meals[0])
    : "Корзина";
  return `${title} на ${intent.days} ${pluralizeDay(intent.days)}`;
}

export function summarizeIntentLine(intent: BasketIntent) {
  return [
    peopleLabel(intent.people),
    intent.budgetRub ? `до ${formatRub(intent.budgetRub)} ₽` : "",
    ...intent.excludedIngredients.slice(0, 2).map((item) => `без ${item}`),
  ].filter(Boolean).join(" · ");
}

function capitalize(value: string) {
  return value ? `${value[0].toLocaleUpperCase("ru-RU")}${value.slice(1)}` : "Корзина";
}

function peopleLabel(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const noun = mod10 === 1 && mod100 !== 11
    ? "человек"
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? "человека"
      : "человек";
  return `${count} ${noun}`;
}

function pluralizeDay(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "дня";
  return "дней";
}

function formatRub(value: number) {
  return value.toLocaleString("ru-RU").replace(/\u00a0/g, " ");
}
