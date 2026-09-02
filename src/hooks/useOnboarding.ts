import { useCallback, useState } from "react";
import { loadOnboardingState, saveOnboardingState } from "../services/onboardingRepository";
import type { OnboardingState, OnboardingStep, Retailer } from "../types/domain";

const previousStep: Partial<Record<OnboardingStep, OnboardingStep>> = {
  delivery: "value",
  profile: "delivery",
};

export function useOnboarding({ ready }: { ready: boolean }) {
  const [state, setState] = useState<OnboardingState>(() => loadOnboardingState());

  const update = useCallback((next: (current: OnboardingState) => OnboardingState) => {
    setState((current) => {
      const value = next(current);
      saveOnboardingState(value);
      return value;
    });
  }, []);

  return {
    state,
    visible: ready && (state.status === "in_progress" || state.status === "not_started"),
    showResultsHint: state.status === "completed" && !state.resultsHintDismissed,
    showBasketEditHint: state.status === "completed" && !state.basketEditHintDismissed,
    start: () => update((current) => ({ ...current, status: "in_progress", step: "delivery" })),
    replay: () => update((current) => ({ ...current, status: "in_progress", step: "value" })),
    open: (step: OnboardingStep, requestDraft = state.requestDraft) => update((current) => ({ ...current, status: "in_progress", step, requestDraft })),
    goTo: (step: OnboardingStep) => update((current) => ({ ...current, status: "in_progress", step })),
    back: () => update((current) => ({ ...current, step: previousStep[current.step] ?? "value" })),
    dismiss: () => update((current) => ({ ...current, status: "dismissed" })),
    setRequestDraft: (requestDraft: string) => update((current) => ({ ...current, requestDraft })),
    complete: (resolvedAddress?: string, resolvedRetailers: Retailer[] = []) => update((current) => ({
      ...current,
      status: "completed",
      step: "profile",
      completedAt: new Date().toISOString(),
      resolvedRetailers,
      ...(resolvedAddress ? { resolvedAddress } : {}),
    })),
    dismissResultsHint: () => update((current) => ({ ...current, resultsHintDismissed: true })),
    dismissBasketEditHint: () => update((current) => ({ ...current, basketEditHintDismissed: true })),
  };
}
