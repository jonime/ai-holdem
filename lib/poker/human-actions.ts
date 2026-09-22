import { pokerEngineAdapter } from "./adapter";
import { type PokerAction, type PokerGameState, PokerRuleError } from "./types";

export interface HumanActionSubmission {
  readonly expectedVersion: number;
  readonly currentVersion: number;
  readonly playerId: string;
  readonly action: PokerAction;
}

export class HumanActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HumanActionError";
  }
}

export function applyHumanAction(
  state: PokerGameState,
  submission: HumanActionSubmission,
): PokerGameState {
  if (submission.expectedVersion !== submission.currentVersion) {
    throw new HumanActionError("Game version is stale");
  }

  const player = state.config.players.find(
    (candidate) => candidate.id === submission.playerId,
  );
  if (!player || player.controller !== "human") {
    throw new HumanActionError(
      "Only a human-controlled player may submit this action",
    );
  }

  const currentActorId = pokerEngineAdapter.snapshot(state).currentActorId;
  if (currentActorId !== player.id) {
    throw new HumanActionError("It is not this player's turn");
  }

  if (player.leaving) {
    try {
      return pokerEngineAdapter.applyAction(state, player.id, { type: "fold" });
    } catch (error) {
      if (error instanceof PokerRuleError) {
        throw new HumanActionError(error.message);
      }
      throw error;
    }
  }

  try {
    return pokerEngineAdapter.applyAction(state, player.id, submission.action);
  } catch (error) {
    if (error instanceof PokerRuleError) {
      throw new HumanActionError(error.message);
    }
    throw error;
  }
}
