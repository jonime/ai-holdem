import { describe, expect, it } from "vitest";
import { minimumRiverShare } from "./adapter";

describe("minimum heads-up river share", () => {
  it.each([
    { hole: ["As", "Ks"], board: ["Qs", "Js", "Ts", "4d", "7h"], share: 1 },
    { hole: ["7d", "2h"], board: ["As", "Ks", "Qs", "Js", "Ts"], share: 0.5 },
    { hole: ["As", "Ah"], board: ["Ac", "Ad", "7s", "4d", "9h"], share: 1 },
    // An ace-high flush can still lose to a straight flush.
    { hole: ["As", "2d"], board: ["9s", "8s", "7s", "6s", "Kh"], share: 0 },
    // A straight on the board is not necessarily a guaranteed chop.
    { hole: ["2d", "3h"], board: ["5s", "6h", "7d", "8c", "9s"], share: 0 },
    // Quads on the board still use a kicker.
    { hole: ["3d", "3h"], board: ["2s", "2h", "2d", "2c", "3s"], share: 0 },
  ])("returns $share for $hole on $board", ({ hole, board, share }) => {
    expect(minimumRiverShare(hole, board)).toBe(share);
  });

  it("rejects incomplete and duplicate cards", () => {
    expect(() => minimumRiverShare(["As", "Ks"], ["Qs", "Js", "Ts"])).toThrow();
    expect(() => minimumRiverShare(["As", "Ks"], ["As", "Js", "Ts", "4d", "7h"])).toThrow();
  });
});
