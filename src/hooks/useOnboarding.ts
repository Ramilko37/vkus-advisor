import { useCallback, useState } from "react";
import { loadOnboardingState, saveOnboardingState } from "../services/onboardingRepository";
import type { OnboardingState } from "../types/domain";

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
    finishIntro: () => update((current) => ({
      ...current,
      status: "completed",
      step: "value",
      completedAt: current.completedAt ?? new Date().toISOString(),
    })),
    replay: () => update((current) => ({ ...current, status: "in_progress", step: "value" })),
    openDelivery: (requestDraft = state.requestDraft) => update((current) => ({
      ...current,
      status: "in_progress",
      step: "delivery",
      requestDraft,
    })),
    completeDelivery: () => update((current) => ({
      ...current,
      status: "completed",
      step: "value",
      requestDraft: "",
      completedAt: current.completedAt ?? new Date().toISOString(),
    })),
    dismiss: () => update((current) => ({ ...current, status: "dismissed", step: "value" })),
    setRequestDraft: (requestDraft: string) => update((current) => ({ ...current, requestDraft })),
    dismissResultsHint: () => update((current) => ({ ...current, resultsHintDismissed: true })),
    dismissBasketEditHint: () => update((current) => ({ ...current, basketEditHintDismissed: true })),
  };
}
