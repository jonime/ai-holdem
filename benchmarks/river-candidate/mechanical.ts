import { OpeningAwareEquityRulesBot } from "@/lib/bots/equity-rules-opening";
import { pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { context, materialize, type Fixture } from "./fixtures";
import { override } from "./candidate";
import { difficulties } from "./config";
import { continuation, holdings, conserve } from "./experiment";
export async function mechanical(fixtures: Fixture[]) {
  let checks=0;
  for(const orientation of [0,1]) for(const difficulty of difficulties) {
    const f=fixtures.find(f=>f.spec.orientation===orientation&&f.spec.replicate===1&&f.spec.band===3)!;
    const available=holdings(f,"broad"), run=materialize(f,available[0]);
    const c=context(run,difficulty);
    if(JSON.stringify(c)!==JSON.stringify(context(materialize(f,available[1]),difficulty))) throw new Error("Hidden-card leak");
    if(c.analysis.equitySamples!==5000) throw new Error("Wrong budget");
    const baseline=await new OpeningAwareEquityRulesBot().decide(c), candidate=override(c,baseline);
    if(candidate===baseline) throw new Error("Mechanical active fixture did not activate");
    engine.applyAction(run.state,run.heroId,candidate.action); checks++;
    if(baseline.action.type!=="bet") throw new Error("Expected baseline bet");
    const after=engine.applyAction(run.state,run.heroId,baseline.action);
    const raise=engine.getLegalActions(after).find(a=>a.type==="raise");
    if(raise?.type!=="raise"||raise.minAmount>=raise.maxAmount) throw new Error("Missing non-all-in raise");
    for(const amount of [raise.minAmount,Math.floor((raise.minAmount+raise.maxAmount)/2),raise.maxAmount]) {
      const other=engine.snapshot(after).currentActorId!;
      const raised=engine.applyAction(after,other,{type:"raise",amount});
      const actions=[...run.actions,{sequence:run.actions.length+1,action:baseline.action,stateBefore:run.state},{sequence:run.actions.length+2,action:{type:"raise" as const,amount},stateBefore:after}];
      const input=context({...run,state:raised,actions},difficulty);
      const response=await new OpeningAwareEquityRulesBot().decide(input);
      const terminal=engine.applyAction(raised,run.heroId,response.action); conserve(terminal);
      if(engine.snapshot(terminal).street!=="complete") {
        // Replay the full unchanged Rules policy for every subsequent legal action.
        await continuation({...run,state:raised,actions},response.action,difficulty,"rules","mechanical");
      }
      checks++;
    }
  }
  return {passed:true,checks,samples:5000};
}
