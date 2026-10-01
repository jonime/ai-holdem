import type { LegalAction } from "@/lib/poker/types";

export type SizedAction = Extract<LegalAction, { type: "bet" | "raise" }>;

export function clampTarget(target: number, action: SizedAction): number {
  return Math.min(action.maxAmount, Math.max(action.minAmount, target));
}

/** Shift accelerates keyboard sizing from one to five big blinds. */
export function adjustTarget(
  action: SizedAction,
  target: number | null,
  bigBlind: number,
  direction: -1 | 1,
  accelerated: boolean,
): number {
  return clampTarget(
    (target ?? action.minAmount) + direction * bigBlind * (accelerated ? 5 : 1),
    action,
  );
}

/** Presets are total street targets; pot includes every displayed side pot. */
export function potPresetTarget(
  action: SizedAction,
  pot: number,
  committedStreet: number,
  callAmount: number,
  fraction: number,
): number {
  return clampTarget(
    action.type === "raise"
      ? committedStreet + callAmount + Math.round(fraction * (pot + callAmount))
      : Math.round(fraction * pot),
    action,
  );
}

export function validatedTarget(draft: string, action: SizedAction | undefined): number | null {
  if (!action || draft.trim() === "") return null;
  const target = Number(draft);
  return Number.isSafeInteger(target) && target >= action.minAmount && target <= action.maxAmount
    ? target
    : null;
}

export function decisionScope(gameId: string | undefined, version: number | undefined, viewerId: string | undefined): string {
  return JSON.stringify([gameId, version, viewerId]);
}
