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

export interface UserProfile {
  userId?: string;
  email?: string;
  address: string;
  lentaStoreId?: string;
  lentaStoreName?: string;
  lentaStoreAddress?: string;
  householdSize: number;
  excludedIngredients: string[];
  preferences: string[];
}

export type OnboardingStatus = "not_started" | "in_progress" | "completed" | "dismissed";
export type OnboardingStep = "value" | "delivery" | "profile";

export interface OnboardingState {
  version: 1;
  status: OnboardingStatus;
  step: OnboardingStep;
  requestDraft: string;
  completedAt?: string;
  resultsHintDismissed: boolean;
  basketEditHintDismissed: boolean;
}

export interface LentaStore {
  id: string;
  name?: string;
  address?: string;
  distanceMeters?: number;
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
  retailer?: "vkusvill" | "pyaterochka" | "lenta" | "demo";
  name: string;
  priceRub: number;
  oldPriceRub?: number;
  loyaltyPriceRub?: number;
  rating?: number;
  reviewsCount?: number;
  weightLabel?: string;
  unit?: string;
  imageUrl?: string;
  productUrl?: string;
  description?: string;
  composition?: string;
  calories?: number;
  proteins?: number;
  fats?: number;
  carbohydrates?: number;
  availability?: "available" | "unavailable" | "unknown";
  priceObservedAt?: string;
  storeId?: string;
  storeName?: string;
  storeAddress?: string;
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
  retailer?: NonNullable<NormalizedProduct["retailer"]>;
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
  retailer?: NormalizedProduct["retailer"];
  strategy: BasketPriority;
  title: string;
  summary: string;
  tradeoffs: string[];
  items: BasketItem[];
  totalRub: number;
  uniqueItemsCount: number;
  warnings: string[];
}

export type RetailerResultStatus = "ready" | "no_candidates" | "insufficient_candidates" | "failed";

export interface RetailerResult {
  retailer: NonNullable<NormalizedProduct["retailer"]>;
  status: RetailerResultStatus;
  candidateCount: number;
  selectedCandidateCount: number;
  variantCount: number;
  message?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
}

export interface AppError {
  source: "llm" | "openrouter" | "mcp" | "validation" | "application";
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
  repairRequired?: boolean;
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
  validateBasketItems?(items: Array<{ xmlId: string; quantity: number; priceRub?: number }>, signal?: AbortSignal): Promise<BasketValidationResult>;
  createCartLink(items: Array<{ xmlId: string; quantity: number }>, signal?: AbortSignal): Promise<string>;
}

export interface BasketValidationResult {
  products: NormalizedProduct[];
  unavailableXmlIds: string[];
  changedPrices: Array<{ xmlId: string; oldPriceRub: number; newPriceRub: number }>;
}

export interface CheckoutResult {
  url: string;
  items?: BasketItem[];
}
