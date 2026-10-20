import type { Cell } from "./evaluator";
import type { Observation } from "./ledger";
import { fixtureIds } from "./ledger";
import { profiles,ranges,continuations,configuration } from "./assumptions";
import { key } from "./replay";
export function analyze(cells:Cell[],observations:Observation[]){
  if(observations.length!==40)throw new Error("Missing observations");
  const fixtures=fixtureIds.map(fixture=>{
    const combinations=ranges.flatMap(range=>profiles.flatMap(profile=>continuations.map(policy=>{
      const selected=cells.filter(c=>c.fixture===fixture&&c.range===range&&c.profile===profile&&c.policy===policy);
      if(!selected.length||new Set(selected.map(c=>key(c.root))).size!==selected.length||selected.some(c=>!Number.isFinite(c.evBB)))throw new Error("Missing/duplicate action cells");
      const value=(k:string)=>{const c=selected.find(c=>key(c.root)===k);if(!c)throw new Error("Missing action: "+k);return c.evBB;};
      const menu=(name:string)=>{
        const rows=observations.filter(r=>r.fixture===fixture&&r.menu===name);
        if(rows.length!==10)throw new Error("Incomplete recorded-menu cell");
        return rows.reduce((s,r)=>s+value(key(r.action!)),0)/10;
      };
      const current=menu("current"),quarter=menu("quarter-pot");
      const rankings=[...selected].sort((a,b)=>b.evBB-a.evBB||key(a.root).localeCompare(key(b.root))).map(c=>({action:key(c.root),evBB:c.evBB}));
      return {range,profile,policy,sizeDifferenceBB:value("bet:3")-value("bet:4"),recordedMenuDifferenceBB:quarter-current,currentMeanBB:current,quarterMeanBB:quarter,rankings};
    })));
    const t=configuration.toleranceBB;
    const pass=combinations.every(c=>c.sizeDifferenceBB>=-t&&c.recordedMenuDifferenceBB>=-t)&&combinations.some(c=>c.recordedMenuDifferenceBB>t);
    const changes=combinations.map(c=>({range:c.range,profile:c.profile,policy:c.policy,size:c.sizeDifferenceBB>t?"3>4":c.sizeDifferenceBB< -t?"4>3":"tie",winner:c.rankings[0].action}));
    const continuationSensitivity=ranges.flatMap(range=>profiles.map(profile=>{
      const group=combinations.filter(c=>c.range===range&&c.profile===profile);
      return {range,profile,values:group.map(c=>({policy:c.policy,sizeBB:c.sizeDifferenceBB,menuBB:c.recordedMenuDifferenceBB})),menuGainDisappears:group.some(c=>c.recordedMenuDifferenceBB>t)&&group.some(c=>c.recordedMenuDifferenceBB<=t),sizeGainDisappears:group.some(c=>c.sizeDifferenceBB>t)&&group.some(c=>c.sizeDifferenceBB<=t)};
    }));
    return {fixture,passed:pass,worstSizeBB:Math.min(...combinations.map(c=>c.sizeDifferenceBB)),worstMenuBB:Math.min(...combinations.map(c=>c.recordedMenuDifferenceBB)),sizeSignReverses:combinations.some(c=>c.sizeDifferenceBB>t)&&combinations.some(c=>c.sizeDifferenceBB< -t),menuSignReverses:combinations.some(c=>c.recordedMenuDifferenceBB>t)&&combinations.some(c=>c.recordedMenuDifferenceBB< -t),rankingPatterns:[...new Set(combinations.map(c=>c.rankings.map(a=>a.action).join(" > ")))],changes,continuationSensitivity,combinations};
  });
  const descriptiveSummary=fixtures[0].combinations.map((c,i)=>({range:c.range,profile:c.profile,policy:c.policy,sizeDifferenceBB:(c.sizeDifferenceBB+fixtures[1].combinations[i].sizeDifferenceBB)/2,recordedMenuDifferenceBB:(c.recordedMenuDifferenceBB+fixtures[1].combinations[i].recordedMenuDifferenceBB)/2}));
  return {version:configuration.version,verdict:fixtures.every(f=>f.passed)?"shortlist-for-later-paid-study-plan":"defer",toleranceBB:configuration.toleranceBB,fixtures,descriptiveSummary,limits:"Retrospective screening of two selected situations; exact conditional synthetic values, no sampling confidence intervals, no independent confirmation or measured playing strength. Ten repetitions do not establish stable LLM frequencies. posterior-best is an optimistic range-informed reference, not an observed LLM response. No causal individual replacements, new calls, production promotion or spending authorization. Failure does not establish universal inferiority."};
}
export function report(analysis:ReturnType<typeof analyze>){
  return `# LLM quarter-pot retrospective river screen v1\n\nVerdict: **${analysis.verdict}**.\n\n${analysis.fixtures.map(f=>`${f.fixture}: ${f.passed?"passes":"fails"} the all-27 gate. Worst size difference ${f.worstSizeBB.toFixed(9)} BB; worst recorded-menu difference ${f.worstMenuBB.toFixed(9)} BB. Size sign reversal: ${f.sizeSignReverses}; menu sign reversal: ${f.menuSignReverses}.`).join("\n\n")}\n\nThe size comparison is bet 3 minus bet 4. Recorded-menu differences average all ten actions per menu, retaining checks and unchanged decisions. Each fixture is gated separately; the equal-weight summary is descriptive only.\n\n${analysis.limits}\n\nSee analysis-v1.json for every combination, action ranking, worst loss and continuation sensitivity; action checkpoints contain exact branch probabilities, posteriors, equity, terminal values and continuation assumptions. Manifest and checkpoint hashes connect the evidence.\n`;
}
