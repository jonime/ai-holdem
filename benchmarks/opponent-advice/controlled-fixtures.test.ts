import { expect, it } from "vitest";
import { controlledAdviceFixtures } from "./controlled-fixtures";
import { conditions } from "./fixtures";
import { opponentAdvice } from "./advice";

it("holds HERO and unrelated statistics fixed even in the omitted-target control", () => {
  for (const fixture of controlledAdviceFixtures(5)) {
    const canonical = fixture.contexts.folding;
    for (const condition of conditions) {
      const context = fixture.contexts[condition];
      const { sessionStats, ...decision } = context;
      const { sessionStats: canonicalStats, ...canonicalDecision } = canonical;
      expect(decision).toEqual(canonicalDecision);
      expect(sessionStats?.coverage).toEqual(canonicalStats?.coverage);
      expect(sessionStats?.participants.filter(p => p.seat !== fixture.target)).toEqual(canonicalStats?.participants.filter(p => p.seat !== fixture.target));
    }
    expect(fixture.contexts.omitted.sessionStats?.participants.some(p => p.seat === fixture.target)).toBe(false);
    expect(opponentAdvice(fixture.contexts.omitted)).toEqual([]);
  }
}, 30_000);
