import type {
  AIDifficulty,
  LegalAction,
  PublicPokerGame,
  PublicPokerPlayer,
  TableSettings,
} from "@/lib/poker/types";

export type { LegalAction, PublicPokerGame, PublicPokerPlayer };
export type { AIDifficulty, TableSettings };

export interface Game {
  readonly id: string;
  readonly status: "waiting" | "playing" | "complete" | "error";
  readonly version: number;
  readonly viewerIsHost: boolean;
  readonly poker: PublicPokerGame;
}

export interface AIDecision {
  readonly action: string;
  readonly amount: number | null;
  readonly probabilities: Readonly<Record<string, number>>;
  readonly confidence: number;
  readonly sizing: {
    readonly choice: string;
    readonly probabilities: Readonly<Record<string, number>>;
    readonly confidence: number;
  } | null;
}

export interface HandActionHistoryItem {
  readonly sequence: number;
  readonly street: string;
  readonly action: string;
  readonly amount: number | null;
  readonly player: string;
  readonly controller: "human" | "typesafe_ai";
}

export type LatestPlayerAction = Pick<
  HandActionHistoryItem,
  "action" | "amount"
>;

export interface CompletedAIDecisionInspection {
  readonly actionSequence: number;
  readonly state: unknown;
  readonly legalActions: unknown;
  readonly choice: string;
  readonly probabilities: unknown;
  readonly confidence: number;
  readonly rawResponse: unknown;
}

export interface HandHistory {
  readonly status: "playing" | "complete" | "error";
  readonly actions: readonly HandActionHistoryItem[];
  readonly aiDecisions: readonly CompletedAIDecisionInspection[];
}
