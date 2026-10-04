import type { AIDifficulty, BotDescriptor, BotPlaystyleId } from "./types";

export type SeatStatus = "open" | "claimed" | "bot";

export interface SeatAssignment {
  readonly gameId: string;
  readonly seat: number;
  readonly name?: string;
  readonly status: SeatStatus;
  readonly controller: "human" | "bot";
  readonly bot?: BotDescriptor | null;
  readonly aiDifficulty?: AIDifficulty | null;
  readonly botProfileId?: BotPlaystyleId | null;
  readonly playerToken: string | null;
  readonly isHost: boolean;
  readonly leaving?: boolean;
  readonly enginePlayerId?: string | null;
}

export interface SeatAssignmentRepository {
  getSeatAssignments(gameId: string): Promise<readonly SeatAssignment[]>;
  updateSeatAssignment(input: {
    readonly gameId: string;
    readonly seat: number;
    readonly status: SeatStatus;
    readonly name?: string;
    readonly controller?: "human" | "bot";
    readonly bot?: BotDescriptor | null;
    readonly aiDifficulty?: AIDifficulty | null;
    readonly botProfileId?: BotPlaystyleId | null;
    readonly playerToken?: string | null;
    readonly isHost?: boolean;
    readonly leaving?: boolean;
    readonly enginePlayerId?: string | null;
  }): Promise<void>;
}

export interface AtomicClaimSeatInput {
  readonly gameId: string;
  readonly expectedVersion: number;
  readonly seat: number;
  readonly playerToken: string;
  readonly name: string | null;
}

export interface AtomicAssignBotInput {
  readonly gameId: string;
  readonly expectedVersion: number;
  readonly seat: number;
  readonly hostToken: string;
  readonly name: string;
  readonly bot: BotDescriptor;
  readonly aiDifficulty: AIDifficulty | null;
  readonly botProfileId: BotPlaystyleId | null;
}

export type AtomicReleaseSeatInput = Omit<AtomicClaimSeatInput, "name">;

export interface AtomicSeatAssignmentRepository {
  claimSeatIfVersion(input: AtomicClaimSeatInput): Promise<SeatAssignment>;
  assignBotIfVersion(input: AtomicAssignBotInput): Promise<SeatAssignment>;
  releaseSeatIfVersion(input: AtomicReleaseSeatInput): Promise<SeatAssignment>;
}
