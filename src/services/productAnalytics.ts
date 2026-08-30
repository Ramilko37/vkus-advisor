import type { OnboardingStep } from "../types/domain";

const ANONYMOUS_ID_KEY = "vkusvill-advisor:anonymous-id";
const SESSION_ID_KEY = "vkusvill-advisor:analytics-session";

export type ProductEventName =
  | "onboarding_shown"
  | "onboarding_started"
  | "onboarding_value_completed"
  | "onboarding_address_entered"
  | "onboarding_store_search_started"
  | "onboarding_store_selected"
  | "onboarding_profile_completed"
  | "onboarding_profile_skipped"
  | "onboarding_completed"
  | "first_baskets_ready"
  | "first_variant_opened"
  | "first_basket_edited"
  | "first_checkout_clicked"
  | "onboarding_dismissed"
  | "onboarding_resumed";

export function trackProductEvent(name: ProductEventName, data: { step?: OnboardingStep; retailer?: string; userId?: string; [key: string]: unknown } = {}) {
  console.info("product_analytics", {
    event: name,
    session_id: storedId(window.sessionStorage, SESSION_ID_KEY),
    user_id: data.userId,
    anonymous_id: storedId(window.localStorage, ANONYMOUS_ID_KEY),
    onboarding_version: 1,
    timestamp: new Date().toISOString(),
    step: data.step,
    retailer: data.retailer,
    ...data,
  });
}

function storedId(storage: Storage, key: string) {
  try {
    const current = storage.getItem(key);
    if (current) return current;
    const value = crypto.randomUUID();
    storage.setItem(key, value);
    return value;
  } catch {
    return crypto.randomUUID();
  }
}
