import type { z } from "zod";
import type { Immutable } from "@/lib/http/common-contracts";
import type { publicPlayerSchema, publicGameSchema, botDescriptorSchema } from "@/lib/http/schemas";

export type PlayerController = "human" | "bot";
export type SeatStatus = "open" | "claimed" | "bot";
export type AIDifficulty = "easy" | "medium" | "hard";
export type BotPlaystyleId = "balanced" | "tight" | "aggressive";

export type BotProvider = "typesafe" | "llm" | "rules";

export type BotDescriptor = Immutable<z.infer<typeof botDescriptorSchema>>;

export interface PokerPlayerConfig {
  readonly id: string;
  readonly seat: number;
  readonly name: string;
  /** `typesafe_ai` is accepted only while restoring legacy state. */
  readonly controller: PlayerController | "typesafe_ai";
  readonly bot?: BotDescriptor | null;
  readonly aiDifficulty?: AIDifficulty | null;
  readonly botProfileId?: BotPlaystyleId | null;
  readonly stack: number;
  readonly status?: SeatStatus;
  readonly playerToken?: string | null;
  readonly isHost?: boolean;
  readonly leaving?: boolean;
}

export type HumanTurnSeconds = 30 | 60 | 90 | null;

export interface GameConfig {
  readonly humanTurnSeconds?: HumanTurnSeconds;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly startingStack?: number;
  readonly seatCount?: number;
  readonly players: readonly PokerPlayerConfig[];
}

export interface TableSettings {
  readonly humanTurnSeconds?: HumanTurnSeconds;
  readonly seatCount: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly startingStack: number;
  readonly botsShowUncontestedWins?: boolean;
}

export type PokerAction =
  | { readonly type: "fold" }
  | { readonly type: "check" }
  | { readonly type: "call"; readonly amount?: number }
  | { readonly type: "bet"; readonly amount: number }
  | { readonly type: "raise"; readonly amount: number };

export type LegalAction =
  | { readonly type: "fold" }
  | { readonly type: "check" }
  | { readonly type: "call"; readonly amount: number }
  | {
      readonly type: "bet";
      readonly minAmount: number;
      readonly maxAmount: number;
    }
  | {
      readonly type: "raise";
      readonly minAmount: number;
      readonly maxAmount: number;
    };

export type PokerStreet = "preflop" | "flop" | "turn" | "river" | "complete";
export type PokerHandCategory =
  | "high-card"
  | "one-pair"
  | "two-pair"
  | "three-of-a-kind"
  | "straight"
  | "flush"
  | "full-house"
  | "four-of-a-kind"
  | "straight-flush";

export interface PokerHandStrength {
  readonly madeHand: PokerHandCategory | null;
  readonly bestFive: readonly string[];
  readonly usesHoleCards: boolean;
  readonly draws: {
    readonly flushDraw: boolean;
    readonly straightCompletionRanks: readonly string[];
  };
}

export interface PokerGameState {
  readonly stateSchemaVersion: 1;
  readonly config: GameConfig;
  readonly engineState: unknown;
  readonly blindPostings?: readonly PokerBlindPosting[];
}

export interface PokerBlindPosting {
  readonly playerId: string;
  readonly blind: "small" | "big";
  readonly amount: number;
}

export interface PokerGameSnapshot {
  readonly handNumber: number;
  readonly street: PokerStreet | null;
  readonly dealerSeat: number | null;
  readonly smallBlindSeat: number | null;
  readonly bigBlindSeat: number | null;
  readonly currentActorId: string | null;
  readonly communityCards: readonly string[];
  readonly pot: number;
  readonly completionReason: "fold" | "showdown" | null;
  readonly winnerIds: readonly string[];
  readonly winnerAmounts: Readonly<Record<string, number>>;
}

// Public projection types are inferred; engine snapshots/configuration stay distinct.
export type PublicPokerPlayer = Immutable<z.input<typeof publicPlayerSchema>>;
export type PublicPokerGame = Immutable<z.input<typeof publicGameSchema>>;

export class PokerRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PokerRuleError";
  }
}
