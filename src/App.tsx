import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell, BasketResults, BasketResultsSkeleton, ConversationPanel } from "./components";
import { FullscreenLoader } from "./components/loader/FullscreenLoader";
import { useLoaderVisualState } from "./components/loader/useLoaderVisualState";
import { OnboardingFlow } from "./components/onboarding/OnboardingFlow";
import { useAuthProfile } from "./hooks/useAuthProfile";
import { useBasketPlanner } from "./hooks/useBasketPlanner";
import { useOnboarding } from "./hooks/useOnboarding";
import { trackProductEvent } from "./services/productAnalytics";
import { registerWebMcpTools } from "./services/webMcpTools";
import type { Retailer, WorkflowStage } from "./types/domain";

const resultsPath = "/results";
const loadingStages: WorkflowStage[] = ["analyzing", "searching", "composing", "creatingCart"];

function currentRoute() {
  return window.location.pathname === resultsPath ? "results" : "home";
}

export function App() {
  const authProfile = useAuthProfile();
  const [route, setRoute] = useState<"home" | "results">(currentRoute);
  const onboarding = useOnboarding({ ready: authProfile.authStatus !== "loading" });
  const validAddress = authProfile.profile.address.trim().length >= 8 && /\d/.test(authProfile.profile.address);
  const resolutionMatches = onboarding.state.status === "completed"
    && normalizeAddressKey(onboarding.state.resolvedAddress) === normalizeAddressKey(authProfile.profile.address);
  const resolvedRetailers = useMemo<Retailer[]>(() => resolutionMatches
    ? onboarding.state.resolvedRetailers ?? []
    : authProfile.profile.lentaStoreId ? ["lenta"] : [], [authProfile.profile.lentaStoreId, onboarding.state.resolvedRetailers, resolutionMatches]);
  const planner = useBasketPlanner(authProfile.profile, resolvedRetailers);
  const hasResults = planner.state.variants.length > 0;
  const [addressFlowOpen, setAddressFlowOpen] = useState(false);
  const { mockResults } = planner;
  const firstBasketsTracked = useRef(false);
  const firstVariantOpenedTracked = useRef(false);
  const firstBasketEditedTracked = useRef(false);
  const firstCheckoutTracked = useRef(false);
  const appContentRef = useRef<HTMLDivElement>(null);
  const loading = loadingStages.includes(planner.state.stage);
  const hasSavedContext = validAddress && resolvedRetailers.length > 0;
  const addressGateVisible = authProfile.authStatus !== "loading" && (!hasSavedContext || addressFlowOpen);
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
    if (planner.state.stage === "ready" && hasResults && route !== "results") {
      window.history.pushState(null, "", resultsPath);
      setRoute("results");
    }
  }, [hasResults, planner.state.stage, route]);

  useEffect(() => {
    if (route !== "results" || hasResults || debugResults) return;
    window.history.replaceState(null, "", "/");
    setRoute("home");
  }, [debugResults, hasResults, route]);

  useEffect(() => {
    if (route === "results" && !hasResults && !loading && debugResults) {
      mockResults();
    }
  }, [debugResults, hasResults, loading, mockResults, route]);

  useEffect(() => {
    if (planner.state.stage !== "ready" || !hasResults || !onboarding.showResultsHint || firstBasketsTracked.current) return;
    firstBasketsTracked.current = true;
    trackProductEvent("first_baskets_ready");
  }, [hasResults, onboarding.showResultsHint, planner.state.stage]);

  useEffect(() => {
    if (addressGateVisible) appContentRef.current?.setAttribute("inert", "");
    else appContentRef.current?.removeAttribute("inert");
  }, [addressGateVisible]);

  if (authProfile.authStatus === "loading") {
    return <div className="address-bootstrap" role="status">Загружаем адрес…</div>;
  }

  return (
    <>
      <div ref={appContentRef} aria-hidden={addressGateVisible || undefined}>
        <AppShell route={route === "results" && (hasResults || debugResults) ? "results" : "home"} authProfile={authProfile} onOpenAddress={() => setAddressFlowOpen(true)}>
          {route === "results" && (hasResults || debugResults) ? (
            hasResults ? (
              <BasketResults
                planner={planner}
                deliveryAddress={authProfile.profile.address}
                showResultsHint={onboarding.showResultsHint}
                showBasketEditHint={onboarding.showBasketEditHint}
                onDismissResultsHint={onboarding.dismissResultsHint}
                onDismissBasketEditHint={onboarding.dismissBasketEditHint}
                onStartNewSearch={() => {
                  planner.reset();
                  openHome();
                }}
                onEditRequest={() => {
                  onboarding.setRequestDraft(planner.state.intent?.originalRequest ?? "");
                  planner.editRequest();
                  openHome();
                }}
                onVariantOpen={(retailer) => {
                  if (firstVariantOpenedTracked.current) return;
                  firstVariantOpenedTracked.current = true;
                  trackProductEvent("first_variant_opened", { retailer });
                }}
                onBasketEdit={(retailer) => {
                  if (firstBasketEditedTracked.current) return;
                  firstBasketEditedTracked.current = true;
                  trackProductEvent("first_basket_edited", { retailer });
                }}
                onCheckoutClick={(retailer) => {
                  if (firstCheckoutTracked.current) return;
                  firstCheckoutTracked.current = true;
                  trackProductEvent("first_checkout_clicked", { retailer });
                }}
              />
            ) : (
              <BasketResultsSkeleton stage={planner.state.stage} />
            )
          ) : (
            <ConversationPanel
              planner={planner}
              hasDeliveryAddress={Boolean(authProfile.profile.address.trim())}
              retailers={resolvedRetailers}
              draft={onboarding.state.requestDraft}
              onDraftChange={onboarding.setRequestDraft}
              onNeedsDelivery={(request) => {
                onboarding.open("delivery", request);
                setAddressFlowOpen(true);
              }}
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
      {addressGateVisible && (
        <OnboardingFlow
          profile={authProfile.profile}
          onProfileChange={authProfile.updateProfile}
          onComplete={(nextProfile, retailers) => {
            if (hasSavedContext) planner.reset();
            onboarding.complete(nextProfile.address, retailers);
            setAddressFlowOpen(false);
          }}
          onCancel={hasSavedContext ? () => setAddressFlowOpen(false) : undefined}
        />
      )}
    </>
  );
}

function normalizeAddressKey(address = "") {
  return address.trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
}
