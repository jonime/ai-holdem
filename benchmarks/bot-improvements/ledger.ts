import { existsSync, writeFileSync } from "node:fs";
import { atomicWrite } from "../bot-audit/safety";
import { rowSchema, type Row, type prepare } from "./experiment";
type Entry = ReturnType<typeof prepare>["plan"][number];
export class Ledger {
  readonly slots: {entry: Entry; requests: number; row: Row | null}[] = [];
  constructor(readonly path: string, readonly manifest: unknown) {
    if (existsSync(path)) throw new Error("Existing allocation cannot be replayed or resumed");
    writeFileSync(path,JSON.stringify({manifest,slots:[]}),{flag:"wx"});
  }
  save() { atomicWrite(this.path,{manifest:this.manifest,slots:this.slots}); }
  reserve(entry: Entry) {
    if (this.slots.length>=600 || this.slots.some(s=>s.entry.id===entry.id) || this.slots.filter(s=>s.entry.provider===entry.provider).length>=300) throw new Error("Allocation exhausted or duplicated");
    const slot = {entry,requests:0,row:null as Row|null}; this.slots.push(slot); this.save(); return slot;
  }
  request(slot: typeof this.slots[number]) {
    if (!this.slots.includes(slot) || slot.requests!==0 || slot.row) throw new Error("Extra request forbidden");
    slot.requests=1; this.save();
  }
  complete(slot: typeof this.slots[number], value: unknown) {
    const row = rowSchema.parse(value);
    if (slot.row || slot.requests!==1 || row.provider!==slot.entry.provider || row.policyArm!==slot.entry.policyArm || row.fixture!==slot.entry.fixture || row.representation!==slot.entry.representation || row.repetition!==slot.entry.repetition) throw new Error("Invalid completed slot");
    slot.row=row; this.save();
  }
}
export function preflight(env: Record<string,string|undefined> = process.env) {
  if (env.BOT_IMPROVEMENTS_AUTHORIZATION!=="approved-600-jev-openrouter-v1" || env.BOT_DECISION_CALL_CAP!=="600" || env.EXTERNAL_INFERENCE_ENABLED!=="true") throw new Error("Explicit approved 600-request allocation required");
  if (!env.TYPESAFE_API_KEY?.trim() || !env.LLM_API_KEY?.trim() || env.LLM_API_ENDPOINT!=="https://openrouter.ai/api/v1/chat/completions") throw new Error("Jev/OpenRouter credentials and exact endpoint required");
}
