import { pokerEngineAdapter } from "./adapter";
import type { PokerGameState } from "./types";

export function restorePersistedState(raw: unknown): PokerGameState {
  if (!raw || typeof raw !== "object") {
    throw new Error("Malformed persisted game state");
  }
  const state = raw as Record<string, unknown>;
  if (state.stateSchemaVersion !== 1) {
    throw new Error("Malformed persisted game state");
  }
  try {
    return pokerEngineAdapter.restore(state as unknown as PokerGameState);
  } catch {
    throw new Error("Malformed persisted game state");
  }
}

