import type {
  AIDifficulty,
  LegalAction,
  PublicPokerGame,
  PublicPokerPlayer,
  TableSettings,
  BotDescriptor,
} from "@/lib/poker/types";

export type { LegalAction, PublicPokerGame, PublicPokerPlayer };
export type { AIDifficulty, TableSettings };
export type { BotDescriptor };

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
  readonly probabilities: Readonly<Record<string, number>> | null;
  readonly bot: BotDescriptor;
  readonly confidence: number | null;
  readonly sizing: {
    readonly choice: string;
    readonly probabilities: Readonly<Record<string, number>> | null;
    readonly confidence: number | null;
  } | null;
  readonly matchedRule: string | null;
}

export interface HandActionHistoryItem {
  readonly sequence: number;
  readonly street: string;
  readonly action: string;
  readonly amount: number | null;
  readonly player: string;
  readonly controller: "human" | "bot";
  readonly bot: BotDescriptor | null;
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
  readonly confidence: number | null;
  readonly bot: BotDescriptor;
  readonly matchedRule: string | null;
  readonly rawResponse: unknown;
}

export interface HandHistory {
  readonly status: "playing" | "complete" | "error";
  readonly actions: readonly HandActionHistoryItem[];
  readonly aiDecisions: readonly CompletedAIDecisionInspection[];
}

export type GameFeedEvent =
  | { readonly type: "handStarted"; readonly handNumber: number }
  | {
      readonly type: "blind";
      readonly handNumber: number;
      readonly player: string;
      readonly controller: "human" | "bot";
      readonly blind: "small" | "big";
      readonly amount: number;
    }
  | {
      readonly type: "action";
      readonly handNumber: number;
      readonly player: string;
      readonly controller: "human" | "bot";
      readonly action: "fold" | "check" | "call" | "bet" | "raise" | "all_in";
      readonly amount: number | null;
      readonly street: "preflop" | "flop" | "turn" | "river";
    }
  | {
      readonly type: "board";
      readonly handNumber: number;
      readonly cards: readonly string[];
    }
  | {
      readonly type: "win";
      readonly handNumber: number;
      readonly player: string;
      readonly amount: number;
      readonly uncontested: boolean;
    };

export interface GameFeed {
  readonly events: readonly GameFeedEvent[];
}
