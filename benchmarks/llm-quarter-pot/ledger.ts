import { createHash } from "node:crypto";
import { z } from "zod";

export const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
export const digest = (value: unknown) => hash(JSON.stringify(value));
const entry = z.object({ id:z.string(), provider:z.enum(["jev","llm"]), menu:z.enum(["current","quarter-pot","1.5-pot"]), fixture:z.string(), repetition:z.number().int().min(0).max(9), inputHash:z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const action = z.discriminatedUnion("type",[z.object({type:z.literal("check")}).strict(),z.object({type:z.literal("fold")}).strict(),z.object({type:z.literal("call"),amount:z.number().optional()}).strict(),z.object({type:z.literal("bet"),amount:z.number().int().positive()}).strict(),z.object({type:z.literal("raise"),amount:z.number().int().positive()}).strict()]);
const row = z.object({id:z.string(),provider:entry.shape.provider,menu:entry.shape.menu,fixture:z.string(),repetition:entry.shape.repetition,control:z.boolean(),addedAvailable:z.boolean(),omission:z.string(),addedSelected:z.boolean(),action:action.nullable(),sizing:z.string().nullable(),payment:z.number().nullable(),potFraction:z.number().nullable(),stackFraction:z.number().nullable(),latencyMs:z.number().nonnegative(),cost:z.number().nonnegative().nullable(),model:z.string().nullable(),revision:z.string().nullable(),policy:z.string().nullable(),failure:z.string().nullable(),failureStage:z.enum(["provider","invariant","engine"]).nullable()}).strict();
const manifest = z.object({version:z.literal("bet-sizing-v1"),fixtureVersion:z.literal("bet-sizing-sixteen-v1"),cap:z.literal(1000),prescribed:z.literal(960),compatibility:z.literal(0),files:z.record(z.string(),z.string()),plan:z.array(entry).length(960),fixtures:z.array(z.object({id:z.string(),hash:z.string(),variants:z.record(z.string(),z.string())}).passthrough()).length(16)}).passthrough();
const ledger = z.object({manifest,cap:z.literal(1000),stopped:z.literal(false),slots:z.array(z.object({entry,requests:z.literal(1),row} ).strict()).length(960)}).strict();
export const fixtureIds = ["2-river-0","2-river-1"] as const;
export function extract(raw:unknown, originalPlan:unknown, freeze:{files:Record<string,string>;planHash:string}) {
  const l=ledger.parse(raw), p=manifest.parse(originalPlan);
  if(digest(originalPlan)!==freeze.planHash||digest(z.object({manifest:z.unknown()}).parse(raw).manifest)!==digest(originalPlan)||digest(p.files)!==digest(freeze.files))throw new Error("Manifest/freeze/ledger mismatch");
  const seen=new Set<string>();
  for(const [i,slot] of l.slots.entries()){
    const e=slot.entry,r=slot.row,k=`${e.provider}/${e.fixture}/${e.menu}/${e.repetition}`;
    if(seen.has(k)||e.id!==`decision-${i}`||digest(e)!==digest(p.plan[i])||r.failure!==null||r.failureStage!==null||!r.action)throw new Error("Duplicate, failed, missing or out-of-plan observation");
    seen.add(k);
    for(const field of ["id","provider","fixture","menu","repetition"] as const)if(r[field]!==e[field])throw new Error("Observation identity mismatch");
    const f=p.fixtures.find(f=>f.id===e.fixture);
    if(!f||e.inputHash!==f.variants[e.menu])throw new Error("Fixture input hash mismatch");
  }
  if(seen.size!==960||new Set(p.fixtures.map(f=>f.id)).size!==16)throw new Error("Incomplete pilot");
  const observations=l.slots.filter(s=>s.entry.provider==="llm"&&fixtureIds.some(id=>id===s.entry.fixture)&&s.entry.menu!=="1.5-pot").map(s=>({...s.entry,...s.row,inputHash:s.entry.inputHash}));
  if(observations.length!==40)throw new Error("Expected forty observations");
  for(const id of fixtureIds)for(const menu of ["current","quarter-pot"]){
    const rows=observations.filter(r=>r.fixture===id&&r.menu===menu);
    if(rows.length!==10||rows.some(r=>r.model!=="openai/gpt-5.4-mini"||r.revision!==r.model||r.control||!r.action||!["bet","check"].includes(r.action.type)))throw new Error("Invalid selected cell");
    const count=(amount:number)=>rows.filter(r=>r.action?.type==="bet"&&r.action.amount===amount).length;
    const expected=id==="2-river-0"?(menu==="current"?[9,0,1]:[6,3,1]):(menu==="current"?[3,0,7]:[0,3,7]);
    if(digest([count(4),count(3),rows.filter(r=>r.action?.type==="check").length])!==digest(expected))throw new Error("Saved action counts mismatch");
  }
  return observations;
}
export type Observation = ReturnType<typeof extract>[number];
