import { z } from "zod";

export const searchQuerySchema = z.object({
  query: z.string().min(1).max(60),
  purpose: z.string().min(1).max(40),
  sort: z.enum(["popularity", "rating", "price_asc", "price_desc"]),
});

export const basketIntentSchema = z.object({
  originalRequest: z.string().max(2000),
  people: z.number().int().min(1).max(20),
  days: z.number().int().min(1).max(31),
  meals: z.array(z.string().max(60)).min(1).max(6),
  budgetRub: z.number().int().positive().nullable(),
  budgetIsHard: z.boolean(),
  maxCookingMinutes: z.number().int().min(0).max(360).nullable(),
  excludedIngredients: z.array(z.string().max(80)).max(20),
  dietaryRestrictions: z.array(z.string().max(120)).max(20),
  preferences: z.array(z.string().max(120)).max(20),
  readyFoodAllowed: z.boolean(),
  priority: z.enum(["balanced", "budget", "speed"]),
  needsClarification: z.boolean(),
  clarificationQuestion: z.string().max(240).nullable(),
  assumptions: z.array(z.string().max(160)).max(4),
  searchQueries: z.array(searchQuerySchema).min(2).max(5),
}).strict();

export const basketItemRoleSchema = z.enum(["breakfast", "main", "protein", "side", "vegetables", "snack", "ready_food", "drink", "other"]);
export const basketReasonCodeSchema = z.enum(["good_value", "versatile", "high_protein", "quick", "ready_to_eat", "breakfast_fit", "adds_variety", "budget_fit", "family_fit", "requested_by_user"]);

export const basketCoverageSchema = z.object({
  people: z.number().int().positive(),
  days: z.number().int().positive(),
  meals: z.array(z.object({
    type: z.string().min(1),
    count: z.number().int().positive(),
  }).strict()).min(1),
  totalMeals: z.number().int().positive(),
  label: z.string().min(1),
}).strict();

export const basketVariantDraftSchema = z.object({
  retailer: z.enum(["vkusvill", "lenta", "pyaterochka", "demo"]),
  strategy: z.enum(["balanced", "economy", "fast"]),
  coverage: basketCoverageSchema,
  prepMinutes: z.number().int().min(0).max(720),
  items: z.array(z.object({
    xmlId: z.string().min(1).max(64),
    quantity: z.number().int().min(1).max(9),
    role: basketItemRoleSchema,
    reasonCode: basketReasonCodeSchema,
  }).strict()).min(4).max(12),
}).strict();

export const basketDraftResponseSchema = z.object({
  variants: z.array(basketVariantDraftSchema).min(3).max(9),
}).strict();

export const basketIntentJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["originalRequest", "people", "days", "meals", "budgetRub", "budgetIsHard", "maxCookingMinutes", "excludedIngredients", "dietaryRestrictions", "preferences", "readyFoodAllowed", "priority", "needsClarification", "clarificationQuestion", "assumptions", "searchQueries"],
  properties: {
    originalRequest: { type: "string" },
    people: { type: "integer", minimum: 1, maximum: 20 },
    days: { type: "integer", minimum: 1, maximum: 31 },
    meals: { type: "array", minItems: 1, maxItems: 6, items: { type: "string", maxLength: 60 } },
    budgetRub: { anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }] },
    budgetIsHard: { type: "boolean" },
    maxCookingMinutes: { anyOf: [{ type: "integer", minimum: 0, maximum: 360 }, { type: "null" }] },
    excludedIngredients: { type: "array", maxItems: 20, items: { type: "string", maxLength: 80 } },
    dietaryRestrictions: { type: "array", maxItems: 20, items: { type: "string", maxLength: 120 } },
    preferences: { type: "array", maxItems: 20, items: { type: "string", maxLength: 120 } },
    readyFoodAllowed: { type: "boolean" },
    priority: { type: "string", enum: ["balanced", "budget", "speed"] },
    needsClarification: { type: "boolean" },
    clarificationQuestion: { anyOf: [{ type: "string", maxLength: 240 }, { type: "null" }] },
    assumptions: { type: "array", maxItems: 4, items: { type: "string", maxLength: 160 } },
    searchQueries: { type: "array", minItems: 2, maxItems: 5, items: {
      type: "object",
      additionalProperties: false,
      required: ["query", "purpose", "sort"],
      properties: {
        query: { type: "string", maxLength: 60 },
        purpose: { type: "string", maxLength: 40 },
        sort: { type: "string", enum: ["popularity", "rating", "price_asc", "price_desc"] },
      },
    } },
  },
} as const;

export const basketDraftJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["variants"],
  properties: {
    variants: {
      type: "array",
      minItems: 3,
      maxItems: 9,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["retailer", "strategy", "coverage", "prepMinutes", "items"],
        properties: {
          retailer: { type: "string", enum: ["vkusvill", "lenta", "pyaterochka", "demo"] },
          strategy: { type: "string", enum: ["balanced", "economy", "fast"] },
          coverage: {
            type: "object",
            additionalProperties: false,
            required: ["people", "days", "meals", "totalMeals", "label"],
            properties: {
              people: { type: "integer", minimum: 1 },
              days: { type: "integer", minimum: 1 },
              meals: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["type", "count"],
                  properties: {
                    type: { type: "string", minLength: 1 },
                    count: { type: "integer", minimum: 1 },
                  },
                },
              },
              totalMeals: { type: "integer", minimum: 1 },
              label: { type: "string", minLength: 1 },
            },
          },
          prepMinutes: { type: "integer", minimum: 0, maximum: 720 },
          items: {
            type: "array",
            minItems: 4,
            maxItems: 12,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["xmlId", "quantity", "role", "reasonCode"],
              properties: {
                xmlId: { type: "string", minLength: 1, maxLength: 64 },
                quantity: { type: "integer", minimum: 1, maximum: 9 },
                role: { type: "string", enum: ["breakfast", "main", "protein", "side", "vegetables", "snack", "ready_food", "drink", "other"] },
                reasonCode: { type: "string", enum: ["good_value", "versatile", "high_protein", "quick", "ready_to_eat", "breakfast_fit", "adds_variety", "budget_fit", "family_fit", "requested_by_user"] },
              },
            },
          },
        },
      },
    },
  },
} as const;

const retailerSchema = z.enum(["vkusvill", "lenta", "pyaterochka", "demo"]);

export const basketVariantSchema = z.object({
  id: z.string().min(1),
  retailer: retailerSchema,
  storeId: z.string().min(1).nullable(),
  strategy: z.enum(["balanced", "economy", "fast"]),
  title: z.string().min(1),
  strategyDescription: z.string().min(1),
  totalRub: z.number().nonnegative(),
  uniqueItemsCount: z.number().int().nonnegative(),
  coverage: basketCoverageSchema,
  constraints: z.object({
    exclusions: z.array(z.string()),
    dietaryRestrictions: z.array(z.string()),
    hardBudgetRub: z.number().positive().nullable(),
  }).strict(),
  prep: z.object({
    minutes: z.number().int().nonnegative(),
    complexity: z.enum(["low", "medium", "high"]),
    label: z.string().min(1),
  }).strict(),
  tradeoffSummary: z.string().min(1),
  deltaToBalanced: z.object({ priceRub: z.number() }).strict(),
  score: z.number().min(0).max(100),
  recommended: z.boolean(),
  validation: z.object({
    status: z.enum(["not_supported", "validated", "partial", "failed", "stale"]),
    checkedAt: z.string().datetime().nullable(),
  }).strict(),
  items: z.array(z.object({
    id: z.string().min(1),
    xmlId: z.string().min(1),
    name: z.string().min(1),
    priceRub: z.number().nonnegative(),
    quantity: z.number().int().positive(),
    role: z.string().min(1),
    reason: z.string().min(1),
    sourceQuery: z.string(),
    isDemo: z.boolean(),
  }).passthrough()).min(4),
  warnings: z.array(z.string()),
}).strict();

export const basketCompareResponseSchema = z.object({
  variants: z.array(basketVariantSchema).min(3),
}).strict().superRefine(({ variants }, ctx) => {
  const requiredStrategies = ["balanced", "economy", "fast"] as const;
  const groups = new Map<string, typeof variants>();
  for (const variant of variants) {
    const key = `${variant.retailer}:${variant.storeId ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), variant]);
  }
  for (const [key, group] of groups) {
    const strategies = new Set(group.map((variant) => variant.strategy));
    const invariant = JSON.stringify({ coverage: group[0]?.coverage, constraints: group[0]?.constraints });
    if (group.length !== 3 || strategies.size !== 3 || !requiredStrategies.every((strategy) => strategies.has(strategy))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Retailer group ${key} must contain exactly three strategies` });
    }
    if (group.some((variant) => JSON.stringify({ coverage: variant.coverage, constraints: variant.constraints }) !== invariant)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Retailer group ${key} has different request invariants` });
    }
    if (group.filter((variant) => variant.recommended).length !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Retailer group ${key} must have exactly one recommendation` });
    }
    for (const variant of group) {
      const computedTotal = Math.round(variant.items.reduce((sum, item) => sum + item.priceRub * item.quantity, 0));
      if (variant.totalRub !== computedTotal || variant.uniqueItemsCount !== variant.items.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Retailer group ${key} has inconsistent computed totals` });
      }
      if (variant.constraints.hardBudgetRub !== null && variant.totalRub > variant.constraints.hardBudgetRub) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Retailer group ${key} exceeds hard budget` });
      }
    }
    const balanced = group.find((variant) => variant.strategy === "balanced");
    const economy = group.find((variant) => variant.strategy === "economy");
    const fast = group.find((variant) => variant.strategy === "fast");
    if (balanced && economy && economy.totalRub > balanced.totalRub) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Retailer group ${key} has an economy strategy above balanced price` });
    }
    if (balanced && fast && fast.prep.minutes > balanced.prep.minutes) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Retailer group ${key} has a fast strategy above balanced prep time` });
    }
  }
});
