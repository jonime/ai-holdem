import { preflopCases, representationCases, representations, materialize, version, type AuditCase } from "./fixtures";
import { digest } from "./safety";
import { configuration } from "./providers";
export function schedule(fixtures: readonly AuditCase[]) {
  const result: { fixture:AuditCase; representation:typeof representations[number]; provider:"jev"|"eevo"|"llm"; repetition:number }[]=[];
  const providers=["jev","eevo","llm"] as const;
  for(let repetition=0;repetition<3;repetition++) {
    const shift=repetition*Math.floor(fixtures.length/3), ordered=[...fixtures.slice(shift),...fixtures.slice(0,shift)];
    for(const [i,fixture] of ordered.entries()) {
      const reps=fixture.section==="preflop" ? ["original"] as const : representations;
      const rotation=(i+repetition)%reps.length, repOrder=[...reps.slice(rotation),...reps.slice(0,rotation)];
      if((i+repetition)%2) repOrder.reverse();
      for(const representation of repOrder) for(let k=0;k<3;k++) result.push({fixture,representation,provider:providers[(i+repetition+k)%3],repetition});
    }
  }
  return result;
}
/** No inference. Every controlled input is hashed before a paid run can be authorized. */
export function preparePilot(files: Record<string,string>, representationFixtures = representationCases()) {
  const fixtures=[...preflopCases(),...representationFixtures], plan=schedule(fixtures);
  if(plan.length!==972) throw new Error("Unexpected pilot allocation");
  const cache=new Map(fixtures.flatMap(f=>(f.section==="preflop"?["original"] as const:representations).map(r=>[`${f.id}:${r}`,materialize(f,r)] as const)));
  const manifest={version,configuration,sourceFreezeDigest:digest(files),plannedRequests:972,compatibilityRequests:0,maximumPrescribedRequests:975,
    plan:plan.map(({fixture:f,representation,provider,repetition})=>({fixture:f.id,representation,provider,repetition,inputHash:digest(cache.get(`${f.id}:${representation}`)!.controlled)}))};
  return {fixtures,plan,cache,manifest};
}
