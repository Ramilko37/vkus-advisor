import { useEffect, useRef, useState } from "react";
import { AppShell, BasketResults, BasketResultsSkeleton, ConversationPanel, EmptyResultsState } from "./components";
import { FullscreenLoader } from "./components/loader/FullscreenLoader";
import { useLoaderVisualState } from "./components/loader/useLoaderVisualState";
import { OnboardingFlow } from "./components/onboarding/OnboardingFlow";
import { useAuthProfile } from "./hooks/useAuthProfile";
import { useBasketPlanner } from "./hooks/useBasketPlanner";
import { useOnboarding } from "./hooks/useOnboarding";
import { registerWebMcpTools } from "./services/webMcpTools";
import type { WorkflowStage } from "./types/domain";

const resultsPath = "/results";
const loadingStages: WorkflowStage[] = ["analyzing", "searching", "composing", "creatingCart"];

function currentRoute() {
  return window.location.pathname === resultsPath ? "results" : "home";
}

export function App() {
  const authProfile = useAuthProfile();
  const planner = useBasketPlanner(authProfile.profile);
  const [route, setRoute] = useState<"home" | "results">(currentRoute);
  const hasResults = planner.state.variants.length > 0;
  const onboarding = useOnboarding({ ready: authProfile.authStatus !== "loading" });
  const { mockResults } = planner;
  const appContentRef = useRef<HTMLDivElement>(null);
  const loading = loadingStages.includes(planner.state.stage);
  const loaderVisual = useLoaderVisualState(planner.state.stage, hasResults);
  const debugResults = import.meta.env.DEV && new URLSearchParams(window.location.search).get("debug") === "results";
  const openHome = () => {
    window.history.pushState(null, "", "/");
    setRoute("home");
  };

  useEffect(() => {
    const controller = new AbortController();
    registerWebMcpTools(controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const onPopState = () => setRoute(currentRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (loading && route !== "results") {
      window.history.pushState(null, "", resultsPath);
      setRoute("results");
    }
  }, [loading, route]);

  useEffect(() => {
    if (planner.state.stage === "ready" && hasResults && route !== "results") {
      window.history.pushState(null, "", resultsPath);
      setRoute("results");
    }
  }, [hasResults, planner.state.stage, route]);

  useEffect(() => {
    if (route === "results" && !hasResults && !loading && debugResults) {
      mockResults();
    }
  }, [debugResults, hasResults, loading, mockResults, route]);

  useEffect(() => {
    if (onboarding.visible) appContentRef.current?.setAttribute("inert", "");
    else appContentRef.current?.removeAttribute("inert");
  }, [onboarding.visible]);

  return (
    <>
      <div ref={appContentRef} aria-hidden={onboarding.visible || undefined}>
        <AppShell route={route} authProfile={authProfile} onOpenOnboarding={onboarding.replay} onOpenDelivery={() => onboarding.openDelivery()}>
          {route === "results" ? (
            hasResults ? (
              <BasketResults
                planner={planner}
                showResultsHint={onboarding.showResultsHint}
                showBasketEditHint={onboarding.showBasketEditHint}
                onDismissResultsHint={onboarding.dismissResultsHint}
                onDismissBasketEditHint={onboarding.dismissBasketEditHint}
                onStartNewSearch={() => {
                  planner.reset();
                  openHome();
                }}
              />
            ) : loading || debugResults ? (
              <BasketResultsSkeleton stage={planner.state.stage} />
            ) : (
              <EmptyResultsState onStart={openHome} />
            )
          ) : (
            <ConversationPanel
              planner={planner}
              hasDeliveryAddress={Boolean(authProfile.profile.address.trim())}
              draft={onboarding.state.requestDraft}
              onDraftChange={onboarding.setRequestDraft}
              onNeedsDelivery={(request) => onboarding.openDelivery(request)}
            />
          )}
        </AppShell>
        {loaderVisual.visible && (
          <FullscreenLoader
            stage={loaderVisual.finishing ? "ready" : planner.state.stage}
            intent={planner.state.intent}
            finishing={loaderVisual.finishing}
            onCancel={planner.cancel}
          />
        )}
      </div>
      {onboarding.visible && (
        <OnboardingFlow
          onboarding={onboarding}
          profile={authProfile.profile}
          onProfileChange={authProfile.updateProfile}
          onDeliveryComplete={async (nextProfile, requestDraft) => {
            if (!requestDraft.trim()) return;
            await planner.submit(requestDraft, nextProfile);
          }}
        />
      )}
    </>
  );
}
