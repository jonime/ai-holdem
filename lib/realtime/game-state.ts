export interface VersionedGame {
  readonly id: string;
  readonly version: number;
}

export interface AppliedGameResponse {
  readonly gameId: string;
  readonly version: number;
  readonly sequence: number;
}

export function reconcileGame<T extends VersionedGame>(
  current: T | null,
  incoming: T,
  lastApplied: AppliedGameResponse | null,
  sequence: number,
): { game: T; applied: AppliedGameResponse } {
  if (current?.id === incoming.id) {
    if (incoming.version < current.version) {
      return {
        game: current,
        applied: lastApplied ?? {
          gameId: current.id,
          version: current.version,
          sequence,
        },
      };
    }
    if (
      incoming.version === current.version &&
      lastApplied?.gameId === incoming.id &&
      sequence < lastApplied.sequence
    ) {
      return { game: current, applied: lastApplied };
    }
  }

  const applied = {
    gameId: incoming.id,
    version: incoming.version,
    sequence,
  };
  return {
    game:
      current && JSON.stringify(current) === JSON.stringify(incoming)
        ? current
        : incoming,
    applied,
  };
}
