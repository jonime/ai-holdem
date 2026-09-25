export type PlayerController = "human" | "bot";
export type SeatStatus = "open" | "claimed" | "bot";
export type AIDifficulty = "easy" | "medium" | "hard";

export type BotProvider = "typesafe" | "openrouter" | "rules";

export interface BotDescriptor {
  readonly id: string;
  readonly label: string;
  readonly provider: BotProvider;
  readonly modelId: string | null;
}

export interface PokerPlayerConfig {
  readonly id: string;
  readonly seat: number;
  readonly name: string;
  /** `typesafe_ai` is accepted only while restoring legacy state. */
  readonly controller: PlayerController | "typesafe_ai";
  readonly bot?: BotDescriptor | null;
  readonly aiDifficulty?: AIDifficulty | null;
  readonly stack: number;
  readonly status?: SeatStatus;
  readonly playerToken?: string | null;
  readonly isHost?: boolean;
  readonly leaving?: boolean;
}

export interface GameConfig {
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly startingStack?: number;
  readonly seatCount?: number;
  readonly players: readonly PokerPlayerConfig[];
}

export interface TableSettings {
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

export interface PublicPokerPlayer {
  readonly id: string;
  readonly name: string;
  readonly controller: PlayerController;
  readonly bot?: BotDescriptor | null;
  readonly aiDifficulty: AIDifficulty | null;
  readonly seat: number;
  readonly status: SeatStatus;
  readonly playerToken: string | null;
  readonly isHost: boolean;
  readonly leaving: boolean;
  readonly inHand: boolean;
  readonly stack: number;
  readonly folded: boolean;
  readonly allIn: boolean;
  readonly bestHand?: PokerHandCategory | null;
  readonly cardsRevealed?: boolean;
  readonly holeCards: readonly string[] | null;
}

export interface PublicPokerGame {
  readonly handNumber: number;
  readonly seatCount: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly startingStack: number;
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
  readonly botsShowUncontestedWins?: boolean;
  readonly legalActions: readonly LegalAction[];
  readonly players: readonly PublicPokerPlayer[];
}

export class PokerRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PokerRuleError";
  }
}
