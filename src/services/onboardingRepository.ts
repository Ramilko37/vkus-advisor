import type { OnboardingState, OnboardingStatus, OnboardingStep } from "../types/domain";

export const ONBOARDING_STORAGE_KEY = "vkusvill-advisor:onboarding:v1";

const statuses: OnboardingStatus[] = ["not_started", "in_progress", "completed", "dismissed"];
const steps: OnboardingStep[] = ["value", "delivery", "profile"];

export function createInitialOnboardingState(): OnboardingState {
  return {
    version: 1,
    status: "not_started",
    step: "value",
    requestDraft: "",
    resultsHintDismissed: false,
    basketEditHintDismissed: false,
  };
}

export function loadOnboardingState(): OnboardingState {
  try {
    const raw = window.localStorage?.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return createInitialOnboardingState();
    const value = JSON.parse(raw) as Partial<OnboardingState>;
    const legacyRequestStep = value.step === ("request" as string);
    if (value.version !== 1 || !statuses.includes(value.status as OnboardingStatus) || (!legacyRequestStep && !steps.includes(value.step as OnboardingStep))) {
      return createInitialOnboardingState();
    }
    return {
      version: 1,
      status: legacyRequestStep && value.status === "in_progress" ? "completed" : value.status as OnboardingStatus,
      step: legacyRequestStep ? "profile" : value.step as OnboardingStep,
      requestDraft: typeof value.requestDraft === "string" ? value.requestDraft : "",
      ...(typeof value.completedAt === "string" ? { completedAt: value.completedAt } : {}),
      resultsHintDismissed: Boolean(value.resultsHintDismissed),
      basketEditHintDismissed: Boolean(value.basketEditHintDismissed),
    };
  } catch {
    return createInitialOnboardingState();
  }
}

export function saveOnboardingState(state: OnboardingState) {
  try {
    window.localStorage?.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // First-run progress remains usable in memory when storage is unavailable.
  }
}
