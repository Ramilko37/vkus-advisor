import type { OnboardingState, OnboardingStatus, OnboardingStep } from "../types/domain";

export const ONBOARDING_STORAGE_KEY = "vkusvill-advisor:onboarding:v1";

const statuses: OnboardingStatus[] = ["not_started", "in_progress", "completed", "dismissed"];
const steps: OnboardingStep[] = ["value", "delivery"];

type LegacyOnboardingState = Omit<Partial<OnboardingState>, "version" | "step"> & {
  version?: number;
  step?: string;
};

export function createInitialOnboardingState(): OnboardingState {
  return {
    version: 2,
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
    const value = JSON.parse(raw) as LegacyOnboardingState;
    if (!statuses.includes(value.status as OnboardingStatus)) return createInitialOnboardingState();

    if (value.version === 2 && steps.includes(value.step as OnboardingStep)) {
      return normalizeState(value, value.step as OnboardingStep, value.status as OnboardingStatus);
    }

    if (value.version === 1) return migrateVersionOne(value);
    return createInitialOnboardingState();
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

function migrateVersionOne(value: LegacyOnboardingState): OnboardingState {
  const status = value.status as OnboardingStatus;
  if (value.step === "delivery") return normalizeState(value, "delivery", status);

  const removedStep = value.step === "profile" || value.step === "request";
  return normalizeState(
    value,
    "value",
    removedStep && status === "in_progress" ? "completed" : status,
    removedStep ? "" : undefined,
  );
}

function normalizeState(
  value: LegacyOnboardingState,
  step: OnboardingStep,
  status: OnboardingStatus,
  requestDraftOverride?: string,
): OnboardingState {
  return {
    version: 2,
    status,
    step,
    requestDraft: requestDraftOverride ?? (typeof value.requestDraft === "string" ? value.requestDraft : ""),
    ...(typeof value.completedAt === "string" ? { completedAt: value.completedAt } : {}),
    resultsHintDismissed: Boolean(value.resultsHintDismissed),
    basketEditHintDismissed: Boolean(value.basketEditHintDismissed),
  };
}
