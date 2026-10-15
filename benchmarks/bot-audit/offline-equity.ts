import { EquityRulesV2Bot } from "@/lib/bots/equity-rules-v2";
import { buildPreflopNode, evaluationContext, preflopNodes, handClasses } from "../poker-context-harness";
import { specFromHistory } from "./replay-adapter";
import { observe } from "./observation";
import type { AuditCase } from "./fixtures";
import { mapping } from "./transform";
import type { Observation } from "./report";
export async function partition(part: number, count: number, progress: (nodes: number)=>void) {
  const rows: Observation[]=[], bot=new EquityRulesV2Bot();
  let nodes=0;
  for (const [index,node] of preflopNodes.entries()) {
    if(index%count!==part) continue;
    for(const h of handClasses) {
      const b=buildPreflopNode(node,h.cards,"facts",1), context=evaluationContext(b.state,b.history,"facts",5000,true);
      const id=`${node.id}-${h.notation}`, spec=specFromHistory(id,b.state,b.history);
      const f: AuditCase={id,section:"preflop",hand:h.notation,weight:h.weight,spec,context,stats:undefined};
      const built={...b,native:context,controlled:context,mapping:mapping(spec,"original"),representation:"original" as const};
      for(const difficulty of ["easy","medium","hard"] as const) for(let rep=0;rep<3;rep++) rows.push(await observe(bot,f,built,"rules",rep,"native",difficulty));
    }
    progress(++nodes);
  }
  return rows;
}
