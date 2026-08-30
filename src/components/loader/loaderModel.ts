import type { WorkflowStage } from "../../types/domain";

export const BASKET_SLOTS = 12;
export const MAX_FALLING_SPRITES = 8;

export function stageFillCap(stage: WorkflowStage) {
  if (stage === "analyzing") return 2;
  if (stage === "searching") return 7;
  if (stage === "composing" || stage === "creatingCart") return 10;
  if (stage === "ready") return BASKET_SLOTS;
  return 0;
}

export function spawnKind(stage: WorkflowStage, landedCount: number, spawnIndex: number, random = Math.random): "catch" | "miss" {
  if (landedCount >= stageFillCap(stage) || spawnIndex % 3 === 0) return "miss";
  return random() < 0.5 ? "catch" : "miss";
}
