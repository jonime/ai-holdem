import { describe, expect, it } from "vitest";

import { reconcileGame } from "./game-state";

describe("reconcileGame", () => {
  it("rejects an older version and a delayed equal-version response", () => {
    const current = { id: "game-1", version: 4, seat: "new" };
    const last = { gameId: "game-1", version: 4, sequence: 3 };

    expect(reconcileGame(current, { ...current, version: 3 }, last, 4).game).toBe(
      current,
    );
    expect(
      reconcileGame(current, { ...current, seat: "old" }, last, 2).game,
    ).toBe(current);
  });

  it("accepts a newer equal-version seat projection", () => {
    const current = { id: "game-1", version: 4, seat: "open" };
    const incoming = { ...current, seat: "claimed" };
    expect(
      reconcileGame(
        current,
        incoming,
        { gameId: "game-1", version: 4, sequence: 2 },
        3,
      ).game,
    ).toBe(incoming);
  });

  it("preserves object identity when authoritative state is unchanged", () => {
    const current = { id: "game-1", version: 4, seat: "claimed" };
    expect(reconcileGame(current, { ...current }, null, 1).game).toBe(current);
  });
});
