import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { observationSchema, type Observation } from "./report";
export const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function verifyFreeze(files: Record<string,string>) {
  if (!Object.keys(files).length) throw new Error("Empty freeze");
  for (const [file, hash] of Object.entries(files)) if (createHash("sha256").update(readFileSync(file)).digest("hex") !== hash) throw new Error(`Audit freeze mismatch: ${file}`);
}
export function preflight(env: Record<string,string | undefined> = process.env) {
  if (env.BOT_SCENARIO_LIVE !== "true" || env.EXTERNAL_INFERENCE_ENABLED !== "true" || env.BOT_AUDIT_AUTHORIZATION !== "authorize-new-972-decision-audit") throw new Error("Fresh explicit authorization and inference opt-ins required");
  const cap = Number(env.BOT_DECISION_CALL_CAP);
  if (!Number.isSafeInteger(cap) || cap < 972 || cap > 1000) throw new Error("Shared cap must be 972–1000; prescribed allocation remains 972");
  for (const name of ["TYPESAFE_API_KEY", "EEVO_API_KEY", "LLM_API_KEY"]) if (!env[name]?.trim() || /^(your_|placeholder|test[-_]?key)/i.test(env[name]!)) throw new Error("All three real provider credentials required locally");
  if (env.LLM_API_ENDPOINT !== "https://openrouter.ai/api/v1/chat/completions") throw new Error("Exact OpenRouter endpoint required");
  return cap;
}
export interface Slot { id: string; provider: "jev" | "eevo" | "llm"; fixture: string; representation: Observation["representation"]; repetition: number; inputHash: string; status: "reserved" | "completed"; observation: Observation | null; requests: number }
export function atomicWrite(path: string, value: unknown) { writeFileSync(`${path}.tmp`, JSON.stringify(value) + "\n"); renameSync(`${path}.tmp`, path); }
export class Ledger {
  readonly slots: Slot[] = [];
  constructor(readonly path: string, readonly cap: number, readonly manifest: unknown) {
    if (!Number.isSafeInteger(cap) || cap < 1 || cap > 1000) throw new Error("Invalid hard shared cap");
    if (existsSync(path)) throw new Error("Existing run cannot be replayed or resumed automatically");
    writeFileSync(path, JSON.stringify({ manifest, cap, slots: [] })+"\n", { flag: "wx" });
  }
  save() { atomicWrite(this.path, { manifest: this.manifest, cap: this.cap, slots: this.slots }); }
  reserve(slot: Omit<Slot,"status"|"observation"|"requests">) {
    if (this.slots.length >= Math.min(972,this.cap) || this.slots.filter(s=>s.provider===slot.provider).length >= 324 || this.slots.some(s=>s.id===slot.id)) throw new Error("Audit allocation exhausted or duplicate slot");
    const reserved: Slot = { ...slot, status: "reserved", observation: null, requests: 0 };
    this.slots.push(reserved); this.save(); return reserved;
  }
  request(slot: Slot) {
    if (slot.status !== "reserved" || slot.requests !== 0) throw new Error("No extra provider requests or retries allowed");
    slot.requests++; this.save();
  }
  complete(slot: Slot, observation: Observation) { if (slot.status !== "reserved") throw new Error("Already completed");
    observationSchema.parse(observation);
    if (slot.provider!==observation.provider || slot.fixture!==observation.fixture || slot.representation!==observation.representation || slot.repetition!==observation.repetition) throw new Error("Observation does not match reserved slot");
    slot.observation=observation; slot.status="completed"; this.save(); }
}
