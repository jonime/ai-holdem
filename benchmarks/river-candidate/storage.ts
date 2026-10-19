import { z } from "zod";
import { gzipSync, gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync, existsSync, linkSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { hash } from "../preflop-action-value/integrity";
import { difficulties, policies, ranges } from "./config";
import { holdings, conserve, type Block, type Rollout } from "./experiment";
import { materialize, type Fixture } from "./fixtures";
export { acquire } from "../preflop-candidate/storage";
const action=z.discriminatedUnion("type",[
  z.object({type:z.literal("fold")}).strict(),z.object({type:z.literal("check")}).strict(),
  z.object({type:z.literal("call"),amount:z.number().int().nonnegative().optional()}).strict(),
  z.object({type:z.literal("bet"),amount:z.number().int().positive()}).strict(),z.object({type:z.literal("raise"),amount:z.number().int().positive()}).strict(),
]);
const rollout=z.object({valueBB:z.number(),trace:z.array(z.object({seat:z.number().int().min(0).max(1),action,rule:z.string().nullable()}).strict()).min(1).max(100),finalStacks:z.array(z.number().int().nonnegative()).length(2)}).strict();
const spec=z.object({id:z.string(),phase:z.enum(["development","confirmation"]),line:z.enum(["flop-bet","turn-bet"]),band:z.number(),orientation:z.number().int().min(0).max(1),replicate:z.number().int().nonnegative(),stratum:z.string()}).strict();
const fixture=z.object({spec,hero:z.array(z.string()).length(2),board:z.array(z.string()).length(5),preRaise:z.number().int(),postBet:z.number().int(),stacks:z.tuple([z.number().int(),z.number().int()]),exclusions:z.record(z.string(),z.number().int().nonnegative())}).strict();
const block=z.object({fixture,difficulty:z.enum(difficulties),samples:z.literal(5000),active:z.boolean(),root:action.nullable(),candidate:action.nullable(),pairs:z.array(z.object({range:z.enum(ranges),policy:z.enum(policies),draw:z.number().int().min(0).max(15),holding:z.array(z.string()).length(2),baseline:rollout,candidate:rollout}).strict()).max(144),failure:z.string().nullable()}).strict();
function replayResult(f: Fixture, holding: string[], result: Rollout) {
  let state=materialize(f,holding).state;
  const start=engine.decisionView(state).players.find(p=>p.seat===f.spec.orientation)!.stack;
  for(const step of result.trace) {
    if(engine.decisionView(state).currentActorSeat!==step.seat) throw new Error("Evidence actor mismatch");
    state=engine.applyAction(state,`p${step.seat}`,step.action); conserve(state);
  }
  const view=engine.decisionView(state);
  if(view.street!=="complete"||JSON.stringify(view.players.map(p=>p.stack))!==JSON.stringify(result.finalStacks)||
    (view.players.find(p=>p.seat===f.spec.orientation)!.stack-start)/2!==result.valueBB) throw new Error("Evidence payout mismatch");
}
export function parse(bytes: Buffer, manifestHash: string, f: Fixture, difficulty: typeof difficulties[number]): Block {
  const p=z.object({manifestHash:z.string(),digest:z.string(),row:block}).strict().parse(JSON.parse(gunzipSync(bytes).toString()));
  const row=p.row;
  if(p.manifestHash!==manifestHash||p.digest!==hash(JSON.stringify(row))||JSON.stringify(row.fixture)!==JSON.stringify(f)||row.difficulty!==difficulty) throw new Error("Checkpoint/source/spec/digest mismatch");
  if(row.failure) return row; // Partial evidence and failure are retained; no retry/rescue.
  if(row.root===null||row.candidate===null||row.pairs.length!==144||row.active===(JSON.stringify(row.root)===JSON.stringify(row.candidate))) throw new Error("Incomplete or inconsistent checkpoint");
  let index=0;
  for(const range of ranges) for(const [draw,holding] of holdings(f,range).entries()) for(const policy of policies) {
    const pair=row.pairs[index++];
    if(pair.range!==range||pair.policy!==policy||pair.draw!==draw||JSON.stringify(pair.holding)!==JSON.stringify(holding)) throw new Error("Pairing changed");
    for(const arm of ["baseline","candidate"] as const) {
      if(JSON.stringify(pair[arm].trace[0].action)!==JSON.stringify(arm==="baseline"?row.root:row.candidate)) throw new Error("Root changed");
      replayResult(f,holding,pair[arm]);
    }
    if(!row.active&&JSON.stringify(pair.baseline)!==JSON.stringify(pair.candidate)) throw new Error("Inactive treatment changed");
  }
  return row;
}
export function save(path: string, manifestHash: string, row: Block) {
  const bytes=gzipSync(JSON.stringify({manifestHash,digest:hash(JSON.stringify(row)),row}));
  parse(bytes,manifestHash,row.fixture,row.difficulty);
  if(existsSync(path)) { if(hash(readFileSync(path))!==hash(bytes)) throw new Error("Immutable checkpoint differs"); return; }
  const temporary=`${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary,bytes,{flag:"wx"});
  try { linkSync(temporary,path); } finally { unlinkSync(temporary); }
}
