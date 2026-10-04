import type {
  AIDifficulty,
  LegalAction,
  PublicPokerGame,
  PublicPokerPlayer,
  TableSettings,
  BotDescriptor,
  BotPlaystyleId,
} from "@/lib/poker/types";

export type { LegalAction, PublicPokerGame, PublicPokerPlayer };
export type { AIDifficulty, BotPlaystyleId, TableSettings };
export type { BotDescriptor };

export type { GameplayGame as Game, GameplayAIDecision as AIDecision } from "@/lib/http/gameplay-contracts";

export interface HandActionHistoryItem {
  readonly sequence: number;
  readonly street: string;
  readonly action: string;
  readonly amount: number | null;
  readonly player: string;
  readonly controller: "human" | "bot";
  readonly bot: BotDescriptor | null;
  readonly botProfileId: BotPlaystyleId | null;
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
  readonly botProfileId: BotPlaystyleId | null;
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
      readonly type: "street";
      readonly handNumber: number;
      readonly street: "preflop" | "flop" | "turn" | "river";
      readonly cards: readonly string[];
    }
  | {
      readonly type: "blind";
      readonly handNumber: number;
      readonly player: string;
      readonly playerId: string | null;
      readonly controller: "human" | "bot";
      readonly blind: "small" | "big";
      readonly amount: number;
    }
  | {
      readonly type: "action";
      readonly handNumber: number;
      readonly player: string;
      readonly playerId: string | null;
      readonly controller: "human" | "bot";
      readonly action: "fold" | "check" | "call" | "bet" | "raise" | "all_in";
      readonly amount: number | null;
      readonly street: "preflop" | "flop" | "turn" | "river";
    }
  | {
      readonly type: "win";
      readonly handNumber: number;
      readonly player: string;
      readonly playerId: string | null;
      readonly amount: number;
      readonly uncontested: boolean;
    };

export interface GameFeed {
  readonly events: readonly GameFeedEvent[];
}
