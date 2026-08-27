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
  maxCookingMinutes: z.number().int().min(0).max(360).nullable(),
  excludedIngredients: z.array(z.string().max(80)).max(20),
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

export const basketVariantDraftSchema = z.object({
  strategy: z.enum(["balanced", "budget", "speed"]),
  items: z.array(z.object({
    xmlId: z.string().min(1).max(64),
    quantity: z.number().int().min(1).max(9),
    role: basketItemRoleSchema,
    reasonCode: basketReasonCodeSchema,
  }).strict()).min(4).max(12),
}).strict();

export const basketDraftResponseSchema = z.object({
  variants: z.array(basketVariantDraftSchema).length(3),
}).strict();

export const basketIntentJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["originalRequest", "people", "days", "meals", "budgetRub", "maxCookingMinutes", "excludedIngredients", "preferences", "readyFoodAllowed", "priority", "needsClarification", "clarificationQuestion", "assumptions", "searchQueries"],
  properties: {
    originalRequest: { type: "string" },
    people: { type: "integer", minimum: 1, maximum: 20 },
    days: { type: "integer", minimum: 1, maximum: 31 },
    meals: { type: "array", minItems: 1, maxItems: 6, items: { type: "string", maxLength: 60 } },
    budgetRub: { anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }] },
    maxCookingMinutes: { anyOf: [{ type: "integer", minimum: 0, maximum: 360 }, { type: "null" }] },
    excludedIngredients: { type: "array", maxItems: 20, items: { type: "string", maxLength: 80 } },
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
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["strategy", "items"],
        properties: {
          strategy: { type: "string", enum: ["balanced", "budget", "speed"] },
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
