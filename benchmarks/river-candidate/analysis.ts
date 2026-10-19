import { configuration, difficulties, policies, ranges, type Phase } from "./config";
import { rng } from "./fixtures";
import type { Block } from "./experiment";
export function cell(row: Block, range: string, policy: string) {
  const pairs=row.pairs.filter(p=>p.range===range&&p.policy===policy);
  return pairs.reduce((s,p)=>s+p.candidate.valueBB-p.baseline.valueBB,0)/pairs.length;
}
export function interval(rows: Block[], range: string, policy: string, phase: Phase, repetitions: number = configuration.bootstrap.resamples) {
  const groups = new Map<string,number[]>();
  for (const row of rows) { const k=row.fixture.spec.stratum, g=groups.get(k)??[]; g.push(cell(row,range,policy)); groups.set(k,g); }
  if (groups.size!==12 || rows.some(r=>r.failure) || [...groups.values()].some(g=>g.length!==(phase==="development"?4:10))) return null;
  const strata=[...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,g])=>g);
  const meanBB=strata.reduce((s,g)=>s+g.reduce((a,b)=>a+b,0)/g.length,0)/12;
  const random=rng(`${configuration.bootstrap.seed}/${phase}/whole-situations`), means:number[]=[];
  for(let n=0;n<repetitions;n++) {
    let total=0;
    for(const g of strata) { let subtotal=0; for(let i=0;i<g.length;i++) subtotal+=g[Math.floor(random()*g.length)]; total+=subtotal/g.length; }
    means.push(total/12);
  }
  means.sort((a,b)=>a-b);
  const confidence=phase==="development"?configuration.bootstrap.developmentConfidence:configuration.bootstrap.confirmationConfidence, tail=(1-confidence)/2;
  return {meanBB,lower:means[Math.floor(repetitions*tail)],upper:means[Math.min(repetitions-1,Math.ceil(repetitions*(1-tail))-1)],confidence,resamples:repetitions};
}
export function analyze(rows: Block[], phase: Phase, mechanical: boolean, repetitions: number = configuration.bootstrap.resamples) {
  return difficulties.map(difficulty=>{
    const block=rows.filter(r=>r.difficulty===difficulty), valid=block.filter(r=>!r.failure);
    const cells=ranges.flatMap(range=>policies.map(policy=>{
      const pairs=valid.flatMap(r=>r.pairs.filter(p=>p.range===range&&p.policy===policy));
      const responses=Object.fromEntries(["baseline","candidate"].map(arm=>{
        const counts:Record<string,number>={};
        for(const p of pairs) for(const t of p[arm as "baseline"|"candidate"].trace.slice(1)) {
          const label=`${t.seat===p.baseline.trace[0].seat?"hero":"opponent"}/${t.action.type}${"amount" in t.action?":"+t.action.amount:""}`;
          counts[label]=(counts[label]??0)+1;
        }
        const firstResponses:Record<string,number>={};
        for(const p of pairs) {const response=p[arm as "baseline"|"candidate"].trace[1];const label=response?.action.type??"terminal";firstResponses[label]=(firstResponses[label]??0)+1;}
        return [arm,{continuations:pairs.length,allActions:counts,firstResponses,firstResponseRates:Object.fromEntries(Object.entries(firstResponses).map(([k,v])=>[k,v/pairs.length]))}];
      }));
      return {range,policy,interval:interval(block,range,policy,phase,repetitions),situationLosses:valid.filter(r=>cell(r,range,policy)<0).map(r=>({id:r.fixture.spec.id,differenceBB:cell(r,range,policy)})),individualLosses:pairs.filter(p=>p.candidate.valueBB<p.baseline.valueBB).length,worstIndividualBB:pairs.length?Math.min(...pairs.map(p=>p.candidate.valueBB-p.baseline.valueBB)):null,responses};
    }));
    const strata=[...new Set(block.map(r=>r.fixture.spec.stratum))].sort().map(stratum=>{
      const group=valid.filter(r=>r.fixture.spec.stratum===stratum);
      return {stratum,situations:group.length,active:group.filter(r=>r.active).length,cells:ranges.flatMap(range=>policies.map(policy=>({range,policy,meanBB:group.reduce((s,r)=>s+cell(r,range,policy),0)/group.length})))};
    });
    const complete=block.length===(phase==="development"?48:120)&&valid.length===block.length;
    const passed=mechanical&&complete&&strata.length===12&&(phase!=="development"||strata.every(s=>s.active>0))&&cells.every(c=>c.interval&&(phase==="development"?c.interval.meanBB>0:c.interval.lower>0));
    return {difficulty,attempted:block.length,complete,mechanical,activation:{count:valid.filter(r=>r.active).length,denominator:block.length,rate:block.length?valid.filter(r=>r.active).length/block.length:0},failures:block.filter(r=>r.failure).map(r=>({id:r.fixture.spec.id,failure:r.failure})),cells,strata,passed,verdict:passed?(phase==="development"?"qualifies-for-confirmation":"eligible-for-manual-promotion-review"):"defer"};
  });
}
