import type { BasketIntent, BasketItem, BasketItemRole, BasketReasonCode, BasketStrategy, BasketVariant, BasketVariantDraft, NormalizedProduct } from "../types/domain";

export const strategyMetadata = {
  balanced: { title: "Сбалансированная", description: "баланс цены и готовки" },
  economy: { title: "Экономная", description: "минимум стоимости" },
  fast: { title: "Быстрая", description: "меньше готовки" },
} as const;

export const reasonLabels: Record<BasketReasonCode, string> = {
  good_value: "Хорошее соотношение цены и объёма",
  versatile: "Подходит для нескольких блюд",
  high_protein: "Источник белка",
  quick: "Быстро готовится",
  ready_to_eat: "Не требует приготовления",
  breakfast_fit: "Подходит для завтрака",
  adds_variety: "Добавляет разнообразие",
  budget_fit: "Помогает уложиться в бюджет",
  family_fit: "Подходит для общей семейной корзины",
  requested_by_user: "Соответствует запросу пользователя",
};

export const roleLabels: Record<BasketItemRole, string> = {
  breakfast: "Завтрак",
  main: "Основное блюдо",
  protein: "Белок",
  side: "Гарнир",
  vegetables: "Овощи",
  snack: "Перекус",
  ready_food: "Готовая еда",
  drink: "Напиток",
  other: "Другое",
};

export function hydrateAndValidateVariants(
  drafts: BasketVariantDraft[],
  candidates: NormalizedProduct[],
  intent: BasketIntent,
  targetCoverage = buildTargetCoverage(intent),
): BasketVariant[] {
  const productMap = new Map(candidates.map((product) => [product.xmlId, product]));
  const retailer = drafts.find((draft) => draft.retailer)?.retailer ?? candidates.find((product) => product.retailer)?.retailer ?? "demo";
  const storeId = candidates.find((product) => product.storeId)?.storeId ?? null;
  const requiredStrategies = ["balanced", "economy", "fast"] as const;

  const variants = requiredStrategies.flatMap((strategy) => {
    const matchingDrafts = drafts.filter((item) => item.strategy === strategy);
    if (matchingDrafts.length !== 1) return [];
    const draft = matchingDrafts[0];
    if (JSON.stringify(draft.coverage) !== JSON.stringify(targetCoverage)) return [];
    if (draft.items.some((item) => !productMap.has(item.xmlId))) return [];

    const warnings: string[] = [];
    const merged = new Map<string, BasketItem>();
    for (const item of draft.items.slice(0, 12)) {
      const product = productMap.get(item.xmlId);
      if (!product) continue;
      const existing = merged.get(product.xmlId);
      const quantity = Math.min(9, Math.max(1, Math.round(item.quantity)));
      if (existing) {
        existing.quantity = Math.min(9, existing.quantity + quantity);
      } else {
        merged.set(product.xmlId, { ...product, quantity, role: roleLabels[item.role], reason: reasonLabels[item.reasonCode] });
      }
    }

    const items = Array.from(merged.values()).slice(0, 12);
    const totalRub = Math.round(items.reduce((sum, item) => sum + item.priceRub * item.quantity, 0));
    if (!basketItemsMeetConstraints(items, totalRub, intent)) return [];
    if (merged.size > 12) warnings.push("Вариант ограничен первыми 12 позициями.");
    if (intent.budgetRub !== null && totalRub > intent.budgetRub) {
      warnings.push(`Сумма выше бюджета ${intent.budgetRub.toLocaleString("ru-RU")} ₽.`);
    }

    return [{
      id: draft.strategy,
      retailer,
      storeId,
      strategy: draft.strategy,
      title: strategyMetadata[draft.strategy].title,
      strategyDescription: strategyMetadata[draft.strategy].description,
      coverage: targetCoverage,
      constraints: {
        exclusions: [...intent.excludedIngredients],
        dietaryRestrictions: [...intent.dietaryRestrictions],
        hardBudgetRub: intent.budgetIsHard ? intent.budgetRub : null,
      },
      prep: prepFromMinutes(draft.prepMinutes),
      tradeoffSummary: "",
      deltaToBalanced: { priceRub: 0 },
      score: 0,
      recommended: false,
      validation: { status: "not_supported" as const, checkedAt: null },
      items,
      totalRub,
      uniqueItemsCount: items.length,
      warnings: Array.from(new Set(warnings)),
    }];
  });

  return scoreBasketVariants(variants, intent);
}

export function scoreBasketVariants(variants: BasketVariant[], intent: BasketIntent): BasketVariant[] {
  const groups = new Map<string, BasketVariant[]>();
  for (const variant of variants) {
    const key = `${variant.retailer}:${variant.storeId ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), variant]);
  }

  return Array.from(groups.values()).flatMap((group) => {
    const balancedTotal = group.find((variant) => variant.strategy === "balanced")?.totalRub ?? group[0]?.totalRub ?? 0;
    const totals = group.map((variant) => variant.totalRub);
    const min = Math.min(...totals);
    const max = Math.max(...totals);
    const spread = max - min;
    const prepValues = group.map((variant) => variant.prep.minutes);
    const minPrep = Math.min(...prepValues);
    const maxPrep = Math.max(...prepValues);
    const prepSpread = maxPrep - minPrep;
    const weights = intent.priority === "budget" ? [0.8, 0.2] : intent.priority === "speed" ? [0.2, 0.8] : [0.5, 0.5];
    const scored = group.map((variant) => {
      const priceScore = spread === 0 ? 100 : ((max - variant.totalRub) / spread) * 100;
      const prepScore = prepSpread === 0 ? 100 : ((maxPrep - variant.prep.minutes) / prepSpread) * 100;
      const score = Math.round(50 + (priceScore * weights[0] + prepScore * weights[1]) / 2);
      return {
        ...variant,
        tradeoffSummary: tradeoffSummary(variant.strategy, variant.totalRub, balancedTotal),
        deltaToBalanced: { priceRub: variant.totalRub - balancedTotal },
        score,
        recommended: false,
      };
    });
    const rank: Record<BasketStrategy, number> = { balanced: 0, economy: 1, fast: 2 };
    const winner = [...scored].sort((a, b) => b.score - a.score || rank[a.strategy] - rank[b.strategy])[0];
    return scored.map((variant) => ({ ...variant, recommended: variant.id === winner?.id }));
  });
}

export function buildTargetCoverage(intent: BasketIntent) {
  const meals = intent.meals.map((type) => ({ type, count: intent.days }));
  const mealLabel = meals.map(({ type, count }) => `${count} ${mealWord(type, count)}`).join(" + ");
  return {
    people: intent.people,
    days: intent.days,
    meals,
    totalMeals: meals.reduce((total, meal) => total + meal.count, 0),
    label: `${mealLabel} · ${intent.people} ${plural(intent.people, ["человек", "человека", "человек"])}`,
  };
}

function prepFromMinutes(minutes: number) {
  const complexity = minutes <= 15 ? "low" : minutes <= 40 ? "medium" : "high";
  return { minutes, complexity, label: `готовка: ~${minutes} мин` } as const;
}

export function productViolatesConstraints(product: NormalizedProduct, intent: BasketIntent) {
  const name = product.name.toLocaleLowerCase("ru-RU");
  const composition = product.composition?.toLocaleLowerCase("ru-RU") ?? "";
  const haystack = `${name} ${product.description ?? ""} ${composition}`;
  const hasHardRestrictions = intent.excludedIngredients.length > 0 || intent.dietaryRestrictions.length > 0;
  if (hasHardRestrictions && !product.composition?.trim()) return true;
  if (productMatchesTerms(product, intent.excludedIngredients)) return true;

  return intent.dietaryRestrictions.some((restriction) => {
    const normalized = restriction.toLocaleLowerCase("ru-RU");
    if (/веган/.test(normalized)) {
      const animal = /говядин|свинин|куриц|индейк|мяс|рыб|лосос|тунец|молок|сливк|сыр|творог|йогурт|яйц|м[её]д/;
      return animal.test(composition) || (!/веган/.test(name) && animal.test(name));
    }
    if (/вегетариан/.test(normalized)) {
      const meat = /говядин|свинин|куриц|индейк|мяс|рыб|лосос|тунец/;
      return meat.test(composition) || (!/вегетариан/.test(name) && meat.test(name));
    }
    if (/лактоз/.test(normalized)) return !/без[\s-]*лактоз/.test(haystack) && /молок|сливк|сыр|творог|йогурт|лактоз/.test(haystack);
    if (/глютен|целиак/.test(normalized)) return !/без[\s-]*глютен/.test(haystack) && /пшениц|ячмен|рожь|ржан|ов[её]с|макарон/.test(haystack);
    return !productMatchesTerms(product, [restriction]);
  });
}

export function productMatchesTerms(product: NormalizedProduct, terms: string[]) {
  const haystackTokens = normalizedTokens(`${product.name} ${product.description ?? ""} ${product.composition ?? ""}`);
  return terms.some((term) => {
    const termTokens = normalizedTokens(term).filter((token) => token !== "без");
    return termTokens.length > 0 && termTokens.every((termToken) => haystackTokens.includes(termToken));
  });
}

export function basketItemsMeetConstraints(items: BasketItem[], totalRub: number, intent: BasketIntent) {
  return items.length >= 4
    && !items.some((item) => productViolatesConstraints(item, intent))
    && items.filter(isGrain).length <= items.length / 2
    && !(intent.budgetIsHard && intent.budgetRub !== null && totalRub > intent.budgetRub);
}

export function strategyTradeoffsHold(variants: BasketVariant[]) {
  const balanced = variants.find((variant) => variant.strategy === "balanced");
  const economy = variants.find((variant) => variant.strategy === "economy");
  const fast = variants.find((variant) => variant.strategy === "fast");
  return Boolean(balanced && economy && fast
    && economy.totalRub <= balanced.totalRub
    && fast.prep.minutes <= balanced.prep.minutes);
}

function normalizedTokens(value: string) {
  const tokens = value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").match(/[а-яa-z0-9]+/g) ?? [];
  return tokens.map(stemRussianToken);
}

function stemRussianToken(token: string) {
  if (token.length < 4) return token;
  return token.replace(/(иями|ями|ами|ого|ему|ому|ыми|ими|ов|ев|ей|ой|ий|ый|ая|яя|ое|ее|ам|ям|ах|ях|ом|ем|ы|и|а|я|у|ю|е|о)$/u, "");
}

function isGrain(product: NormalizedProduct) {
  return /греч|рис|макарон|булгур|кус-?кус|киноа|перлов|пшен|овся|хлопья|круп/.test(`${product.name} ${product.description ?? ""}`.toLocaleLowerCase("ru-RU"));
}

function mealWord(type: string, count: number) {
  const forms: Record<string, [string, string, string]> = {
    завтрак: ["завтрак", "завтрака", "завтраков"],
    обед: ["обед", "обеда", "обедов"],
    ужин: ["ужин", "ужина", "ужинов"],
    перекус: ["перекус", "перекуса", "перекусов"],
  };
  return plural(count, forms[type.toLocaleLowerCase("ru-RU")] ?? [type, type, type]);
}

function plural(count: number, forms: [string, string, string]) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

function tradeoffSummary(strategy: BasketStrategy, totalRub: number, balancedTotal: number) {
  if (strategy === "balanced") return "Цена и готовка в балансе.";
  if (strategy === "economy") return totalRub < balancedTotal ? "Дешевле, но готовки может быть больше." : totalRub === balancedTotal ? "Та же цена, но готовки может быть больше." : "По цене выше баланса, проверьте состав.";
  return totalRub > balancedTotal ? "Дороже, зато быстрее." : "Быстрее без переплаты.";
}
