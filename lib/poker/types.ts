export type PlayerController = "human" | "typesafe_ai";
export type SeatStatus = "open" | "claimed" | "bot";
export type AIDifficulty = "easy" | "medium" | "hard";

export interface PokerPlayerConfig {
  readonly id: string;
  readonly seat: number;
  readonly name: string;
  readonly controller: PlayerController;
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
  readonly seatCount?: number;
  readonly players: readonly PokerPlayerConfig[];
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

export interface PokerGameState {
  readonly stateSchemaVersion: 1;
  readonly config: GameConfig;
  readonly engineState: unknown;
}

export interface PokerGameSnapshot {
  readonly handNumber: number;
  readonly street: PokerStreet | null;
  readonly currentActorId: string | null;
  readonly communityCards: readonly string[];
  readonly pot: number;
  readonly completionReason: "fold" | "showdown" | null;
  readonly winnerIds: readonly string[];
}

export interface PublicPokerPlayer {
  readonly id: string;
  readonly name: string;
  readonly controller: PlayerController;
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
  readonly holeCards: readonly string[] | null;
}

export interface PublicPokerGame {
  readonly handNumber: number;
  readonly seatCount: number;
  readonly street: PokerStreet | null;
  readonly currentActorId: string | null;
  readonly communityCards: readonly string[];
  readonly pot: number;
  readonly completionReason: "fold" | "showdown" | null;
  readonly winnerIds: readonly string[];
  readonly legalActions: readonly LegalAction[];
  readonly players: readonly PublicPokerPlayer[];
}

export class PokerRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PokerRuleError";
  }
}
