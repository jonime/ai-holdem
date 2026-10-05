import { describe, expect, it } from "vitest";
import { buildPreflopNode, preflopNodes } from "@/benchmarks/poker-context-harness";
import { selectPokerAdvice } from "./strategy-advice";

describe("advisory strategy selection", () => {
  it("preserves all candidates and selects heads-up opening advice", () => {
    const ctx=buildPreflopNode(preflopNodes.find(n => n.id === "HU-open")!,["As","Ks"]).context;
    const original=structuredClone(ctx);
    const advice=selectPokerAdvice(ctx);
    expect(advice.scope).toBe("heads_up");
    expect(advice.items.map(i => i.id)).toContain("hu-preflop");
    expect(ctx).toEqual(original);
  });
  it("does not mistake folded six-seat openings for heads-up preflop", () => {
    const ctx=buildPreflopNode(preflopNodes.find(n => n.id === "six-open-small_blind")!,["As","Ks"]).context;
    expect(ctx.situation?.activeOpponentCount).toBe(1);
    const advice=selectPokerAdvice(ctx);
    expect(advice.scope).toBe("multiway");
    expect(advice.items.map(i => i.id)).not.toContain("hu-preflop");
  });
  it("uses general guidance for unknown and unsupported situations", () => {
    const ctx=buildPreflopNode(preflopNodes[0],["As","Ks"]).context;
    expect(selectPokerAdvice({ ...ctx,situation:undefined }).items.map(i => i.id)).toEqual(["advisory","unknown"]);
    expect(selectPokerAdvice({ ...ctx,opponents:[] }).scope).toBe("general");
  });
  it("keeps heads-up patterns off streets with earlier multiway actions", () => {
    const ctx=buildPreflopNode(preflopNodes.find(n => n.id === "HU-open")!,["As","Ks"]).context;
    const changed={ ...ctx,hand:{ ...ctx.hand,street:"flop" as const },actionHistory:[{ sequence:1,street:"flop" as const,action:"bet" as const,amount:2,actorSeat:1,actor:"opponent" as const,controller:"bot" as const,activeSeats:[0,1,2] }] };
    expect(selectPokerAdvice(changed).scope).toBe("multiway");
  });
  it("withholds detailed heads-up barrels when the preceding street was multiway", () => {
    const ctx=buildPreflopNode(preflopNodes.find(n => n.id === "HU-open")!,["As","Ks"]).context;
    const advice=selectPokerAdvice({ ...ctx,hand:{ ...ctx.hand,street:"turn" },
      actionHistory:[{ sequence:1,street:"flop",action:"bet",amount:6,actorSeat:1,actor:"opponent",controller:"bot",activeSeats:[0,1,2] }],
      facts:{ ...ctx.facts!,actionLines:[{ sequence:2,seat:1,street:"turn",labels:["repeated_barrel"] }] } });
    expect(advice.items.map(item => item.id)).not.toContain("hu-barrel");
  });
  it("selects draw, low-SPR and river advice without numerical defense budgets", () => {
    const ctx=buildPreflopNode(preflopNodes.find(n => n.id === "HU-open")!,["As","Ks"]).context;
    const river={ ...ctx,hand:{ ...ctx.hand,street:"river" as const },analysis:{ ...ctx.analysis,stackToPotRatio:1 } };
    const advice=selectPokerAdvice(river);
    expect(advice.items.map(i => i.id)).toContain("river-blockers");
    expect(advice.items.map(i => i.id)).toContain("low-spr");
  });
});
