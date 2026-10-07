/** Server-prepared engine fold; never accepted as an HTTP request payload. */
export interface DepartureFold {
  readonly gameId: string;
  readonly expectedVersion: number;
  readonly playerEngineId: string;
  readonly currentState: unknown;
  readonly stateSchemaVersion: number;
  readonly handNumber: number;
  readonly status: "playing" | "complete";
  readonly street: "preflop" | "flop" | "turn" | "river";
  readonly action: "fold";
  readonly amount: null;
  readonly stateBefore: unknown;
  readonly handComplete: boolean;
  readonly autoRevealPlayerEngineId?: string | null;
  readonly autoRevealReason?: "bot_uncontested" | null;
}
