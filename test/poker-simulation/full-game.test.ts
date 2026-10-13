import { describe, expect, inject, it } from "vitest";
import { createDeterministicDeck, pokerEngineAdapter as adapter } from "../../lib/poker/adapter";
import type { PokerGameState } from "../../lib/poker/types";
import { accountingFacts } from "./adapter-facts";
import { failureDiagnostic, simulate, syntheticConfig, type SimulationCase } from "./harness";

declare module "vitest" {
  interface ProvidedContext { pokerSimulationCases: SimulationCase[] }
}

const defaults = [2, 3, 4, 5, 6].flatMap(seats => [1, 2, 3, 4, 5].map(seed => ({ seed, seats, hands: 10 })));
// Only the dedicated config provides extended cases. Ambient env never expands npm run check.
const cases = inject("pokerSimulationCases") ?? defaults;
if (cases.length === 0) throw new Error("Empty simulation selection");

function passive(state: PokerGameState) {
  const legal = adapter.getLegalActions(state);
  const action = legal.find(a => a.type === "check") ?? legal.find(a => a.type === "call");
  if (!action) throw new Error("Expected passive action");
  return action;
}
function maximum(state: PokerGameState) {
  const aggressive = adapter.getLegalActions(state).find(a => a.type === "bet" || a.type === "raise");
  return aggressive && (aggressive.type === "bet" || aggressive.type === "raise")
    ? { type: aggressive.type, amount: aggressive.maxAmount } : passive(state);
}

function verifyFixture(result: ReturnType<typeof simulate>, name: string, hands: number, check: () => void) {
  try { check(); } catch (error) {
    const last = result.trace.at(-1);
    throw new Error(failureDiagnostic({ seed: 0, seats: result.state.config.players.length, hands },
      result.state.config, adapter.snapshot(result.state).handNumber, (last?.index ?? -1) + 1,
      result.trace, name), { cause: error });
  }
}

describe("deterministic full-game simulations", () => {
  it.each(cases)("seed $seed / $seats seats / at most $hands hands", testCase => {
    simulate(testCase);
  });

  it("guarantees below-blind all-ins and side pots while zero stacks are unresolved", () => {
    let unresolved = false;
    const result = simulate({ seed: 0, seats: 3, hands: 1 }, {
      name: "short all-ins and side pots", config: syntheticConfig([3, 20, 50]), choose: maximum,
      observe(state) {
        const facts = accountingFacts(state);
        if (!facts.complete && facts.players.some(p => p.allIn && facts.stacks[p.id] === 0)) unresolved = true;
      },
    });
    verifyFixture(result, "short all-ins and side pots", 1, () => {
      expect(unresolved).toBe(true);
      expect(accountingFacts(result.state).pots.length).toBeGreaterThan(1);
      expect(adapter.snapshot(result.state).completionReason).toBe("showdown");
    });
  });

  it("guarantees an uncalled raise refund", () => {
    const result = simulate({ seed: 0, seats: 2, hands: 1 }, {
      name: "uncalled refund", config: syntheticConfig([100, 100]),
      choose: (state, index) => index === 0 ? maximum(state) : { type: "fold" },
    });
    verifyFixture(result, "uncalled refund", 1, () => {
      const facts = accountingFacts(result.state);
      expect(result.trace.map(a => a.action)).toEqual([{ type: "raise", amount: 100 }, { type: "fold" }]);
      expect(facts.players.reduce((sum, p) => sum + p.committed, 0)).toBe(110);
      expect(facts.pots.reduce((sum, p) => sum + p.amount, 0)).toBe(20);
      expect(facts.stacks).toEqual({ "synthetic-0": 110, "synthetic-1": 90 });
    });
  });

  it("guarantees an odd-chip board split with folded dead money", () => {
    // Deal order 1,2,0 twice; burns at 6,10,12; royal flush board at 7–9,11,13.
    const deck = createDeterministicDeck(["2c", "3d", "4h", "5c", "6d", "7h", "8c", "Ts", "Js", "Qs", "9c", "Ks", "9d", "As"]);
    const result = simulate({ seed: 0, seats: 3, hands: 1 }, {
      name: "odd-chip split", config: syntheticConfig([100, 100, 100]), deck,
      choose: (state, index) => index === 1 ? { type: "fold" } : passive(state),
    });
    verifyFixture(result, "odd-chip split", 1, () => {
      const pots = accountingFacts(result.state).pots;
      expect(pots).toHaveLength(2);
      expect(pots[0].amount).toBe(15);
      expect(pots[0].awards.map(a => a.amount)).toEqual([8, 7]);
      expect(adapter.snapshot(result.state).winnerAmounts).toEqual({ "synthetic-2": 13, "synthetic-0": 12 });
    });
  });

  it("records passive termination after 64 minimum raises and finishes before the hard cap", () => {
    const result = simulate({ seed: 0, seats: 2, hands: 1 }, {
      name: "passive termination", config: syntheticConfig([1000, 1000]),
      choose(state) {
        const raise = adapter.getLegalActions(state).find(a => a.type === "raise");
        if (raise?.type !== "raise") throw new Error("Expected minimum raise");
        return { type: "raise", amount: raise.minAmount };
      },
    });
    verifyFixture(result, "passive termination", 1, () => {
      expect(result.trace.slice(0, 64).every(a => a.action.type === "raise")).toBe(true);
      expect(result.trace[64]).toMatchObject({ index: 64, policy: "passive-after-64", action: { type: "call" } });
      expect(result.trace.slice(64).every(a => a.policy === "passive-after-64" && ["call", "check"].includes(a.action.type))).toBe(true);
      expect(result.trace.length).toBeLessThan(128);
      expect(adapter.snapshot(result.state).street).toBe("complete");
    });
  });

  it("guarantees consecutive hands with fresh baselines and rotating button", () => {
    const buttons: (number | null)[] = [];
    const result = simulate({ seed: 0, seats: 3, hands: 3 }, {
      name: "consecutive hands", config: syntheticConfig([100, 100, 100]), choose: passive,
      observe(state, index, hand) { if (hand > 0 && index === 0) buttons.push(adapter.snapshot(state).dealerSeat); },
    });
    verifyFixture(result, "consecutive hands", 3, () => {
      expect(buttons).toEqual([0, 1, 2]);
      expect(result.state.handStartStacks?.handNumber).toBe(3);
      expect(result.decks).toHaveLength(3);
    });
  });
});
