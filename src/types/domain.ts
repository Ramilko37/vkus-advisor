export type BasketPriority = "balanced" | "budget" | "speed";
export type BasketItemRole = "breakfast" | "main" | "protein" | "side" | "vegetables" | "snack" | "ready_food" | "drink" | "other";
export type BasketReasonCode = "good_value" | "versatile" | "high_protein" | "quick" | "ready_to_eat" | "breakfast_fit" | "adds_variety" | "budget_fit" | "family_fit" | "requested_by_user";

export type WorkflowStage =
  | "idle"
  | "analyzing"
  | "clarifying"
  | "searching"
  | "composing"
  | "ready"
  | "creatingCart"
  | "error";

export type ProductSort = "popularity" | "rating" | "price_asc" | "price_desc";

export interface SearchQuery {
  query: string;
  purpose: string;
  sort: ProductSort;
}

export interface BasketIntent {
  originalRequest: string;
  people: number;
  days: number;
  meals: string[];
  budgetRub: number | null;
  maxCookingMinutes: number | null;
  excludedIngredients: string[];
  preferences: string[];
  readyFoodAllowed: boolean;
  priority: BasketPriority;
  needsClarification: boolean;
  clarificationQuestion: string | null;
  assumptions: string[];
  searchQueries: SearchQuery[];
}

export interface NormalizedProduct {
  id: string;
  xmlId: string;
  name: string;
  priceRub: number;
  oldPriceRub?: number;
  rating?: number;
  reviewsCount?: number;
  weightLabel?: string;
  imageUrl?: string;
  productUrl?: string;
  description?: string;
  composition?: string;
  calories?: number;
  proteins?: number;
  fats?: number;
  carbohydrates?: number;
  sourceQuery: string;
  isDemo: boolean;
}

export interface BasketVariantItemDraft {
  xmlId: string;
  quantity: number;
  role: BasketItemRole;
  reasonCode: BasketReasonCode;
}

export interface BasketVariantDraft {
  strategy: BasketPriority;
  items: BasketVariantItemDraft[];
}

export interface BasketItem extends NormalizedProduct {
  quantity: number;
  role: string;
  reason: string;
}

export interface BasketVariant {
  id: string;
  strategy: BasketPriority;
  title: string;
  summary: string;
  tradeoffs: string[];
  items: BasketItem[];
  totalRub: number;
  uniqueItemsCount: number;
  warnings: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
}

export interface AppError {
  source: "openrouter" | "mcp" | "validation" | "application";
  code: string;
  message: string;
  recoverable: boolean;
}

export interface StructuredGenerationResult<T> {
  data: T;
  model: string;
  finishReason?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
    cachedTokens?: number;
  };
  durationMs?: number;
  retryCount?: number;
  fallbackModelUsed?: boolean;
}

export interface PipelineMetrics {
  requestId: string;
  totalMs: number;
  intentMs: number;
  catalogSearchMs: number;
  catalogDetailsMs: number;
  basketMs: number;
  repairMs: number;
  searchQueryCount: number;
  catalogRequestCount: number;
  catalogDetailsRequestCount: number;
  rawCandidateCount: number;
  finalCandidateCount: number;
  candidatePayloadBytes: number;
  intentModel?: string;
  basketModel?: string;
  intentPromptTokens?: number;
  intentCompletionTokens?: number;
  intentReasoningTokens?: number;
  basketPromptTokens?: number;
  basketCompletionTokens?: number;
  basketReasoningTokens?: number;
  intentRetryCount: number;
  basketRetryCount: number;
  intentRepairUsed: boolean;
  basketRepairUsed: boolean;
  catalogReused: boolean;
  fallbackModelUsed: boolean;
}

export interface CatalogClient {
  readonly mode: "live" | "demo";
  connect(signal?: AbortSignal): Promise<void>;
  searchProducts(query: SearchQuery, signal?: AbortSignal): Promise<NormalizedProduct[]>;
  getProductDetails(productId: string, signal?: AbortSignal): Promise<Partial<NormalizedProduct>>;
  createCartLink(items: Array<{ xmlId: string; quantity: number }>, signal?: AbortSignal): Promise<string>;
}
