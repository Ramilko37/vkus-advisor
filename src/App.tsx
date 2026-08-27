import { useEffect, useState } from "react";
import { AppShell, BasketResults, BasketResultsSkeleton, ConversationPanel, EmptyResultsState, FullscreenLoader } from "./components";
import { useBasketPlanner } from "./hooks/useBasketPlanner";
import type { WorkflowStage } from "./types/domain";

const resultsPath = "/results";
const loadingStages: WorkflowStage[] = ["analyzing", "searching", "composing", "creatingCart"];

function currentRoute() {
  return window.location.pathname === resultsPath ? "results" : "home";
}

export function App() {
  const planner = useBasketPlanner();
  const [route, setRoute] = useState<"home" | "results">(currentRoute);
  const hasResults = planner.state.variants.length > 0;
  const loading = loadingStages.includes(planner.state.stage);
  const debugResults = import.meta.env.DEV && new URLSearchParams(window.location.search).get("debug") === "results";
  const openHome = () => {
    window.history.pushState(null, "", "/");
    setRoute("home");
  };

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
      planner.mockResults();
    }
  }, [debugResults, hasResults, loading, planner.mockResults, route]);

  return (
    <>
      <AppShell route={route}>
        {route === "results" ? (
          hasResults ? (
            <BasketResults planner={planner} />
          ) : loading || debugResults ? (
            <BasketResultsSkeleton stage={planner.state.stage} />
          ) : (
            <EmptyResultsState onStart={openHome} />
          )
        ) : (
          <ConversationPanel planner={planner} />
        )}
      </AppShell>
      {loading && <FullscreenLoader stage={planner.state.stage} />}
    </>
  );
}
