import { useEffect, useState } from "react";
import type { WorkflowStage } from "../../types/domain";

const FINISH_DURATION_MS = 700;

export function useLoaderVisualState(stage: WorkflowStage, hasResults: boolean) {
  const reducedMotion = usePrefersReducedMotion();
  const running = isBasketLoading(stage);
  const [armed, setArmed] = useState(running);

  useEffect(() => {
    if (running) setArmed(true);
  }, [running]);

  useEffect(() => {
    if (stage !== "ready" || !hasResults || !armed || reducedMotion) return;
    const timeout = window.setTimeout(() => setArmed(false), FINISH_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [armed, hasResults, reducedMotion, stage]);

  const finishing = stage === "ready" && hasResults && armed && !reducedMotion;
  return {
    visible: running || stage === "creatingCart" || finishing,
    finishing,
  };
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const onChange = () => setReduced(media.matches);
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, []);

  return reduced;
}

function isBasketLoading(stage: WorkflowStage) {
  return stage === "analyzing" || stage === "searching" || stage === "composing";
}
