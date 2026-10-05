import { describe,expect,it } from "vitest";
import { emptyDiagnostics } from "@/lib/bots/types";
import { handClasses, preflopNodes, buildPreflopNode, cappedBot, pairedInterval, playEvaluationHand } from "./poker-context-harness";

describe("context evaluation harness", () => {
  it("covers exactly 169 weighted classes and all required preflop nodes", () => {
    expect(handClasses).toHaveLength(169);
    expect(new Set(handClasses.map(h => h.notation)).size).toBe(169);
    expect(handClasses.reduce((sum,h) => sum+h.weight,0)).toBe(1326);
    expect(preflopNodes).toHaveLength(11);
    for (const node of preflopNodes) {
      const result=buildPreflopNode(node,["As","Ks"]);
      expect(result.context.hero.holeCards).toEqual(["As","Ks"]);
      expect(result.context.hero.position).toBe(node.position);
      expect(result.context.situation?.preflop).toBe(node.line === "open" ? "unopened" : node.line === "reraised" ? "re-raised" : node.line);
      expect(result.context.situation?.historyStatus).toBe("complete");
    }
  });
  it("enforces a shared call cap before invoking providers", async () => {
    let calls=0;
    const bot=cappedBot({ async decide() { calls++; return { action:{ type:"check" },diagnostics:emptyDiagnostics(),rawResponse:null }; } },{ remaining:1 });
    const ctx=buildPreflopNode(preflopNodes[0],["As","Ks"]).context;
    await bot.decide(ctx);
    await expect(bot.decide(ctx)).rejects.toThrow("cap exhausted");
    expect(calls).toBe(1);
  });
  it("computes paired seed intervals and marks insufficient evidence", () => {
    expect(pairedInterval([1,1,1])).toEqual({ mean:1,confidence95:[1,1] });
    expect(pairedInterval([1])).toBeNull();
  });
  it.each([2,6] as const)("finishes seeded %i-seat hands using production history projection", async seats => {
    const passive={ async decide(context: Parameters<import("@/lib/bots/types").PokerBot["decide"]>[0]) {
      const legal=context.legalActions.find(a => a.type === "check" || a.type === "call")!;
      if (legal.type !== "check" && legal.type !== "call") throw new Error("Missing passive action");
      return { action:legal,diagnostics:emptyDiagnostics(),rawResponse:null };
    } };
    const first=await playEvaluationHand(passive,passive,seats,0,7,"facts");
    const second=await playEvaluationHand(passive,passive,seats,0,7,"facts");
    expect(second.profitBB).toBe(first.profitBB);
  });
});
