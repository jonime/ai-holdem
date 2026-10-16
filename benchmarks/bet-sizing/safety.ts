import { existsSync, openSync, writeSync, fsyncSync, closeSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { digest } from "../bot-audit/safety";
import { rowSchema, type Entry, type Row } from "./experiment";
/** Flush both contents and directory rename before a paid request can dispatch. */
function durableWrite(path: string, value: unknown, exclusive = false) {
  const target = exclusive ? path : `${path}.tmp`;
  const fd = openSync(target, exclusive ? "wx" : "w", 0o600);
  try { writeSync(fd, JSON.stringify(value) + "\n"); fsyncSync(fd); } finally { closeSync(fd); }
  if (!exclusive) renameSync(target, path);
  const directory = openSync(dirname(path), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}
export function preflight(env: Record<string, string | undefined> = process.env) {
  if (env.BET_SIZING_AUTHORIZATION !== "authorize-new-960-bet-sizing-v1" || env.BOT_SCENARIO_LIVE !== "true" || env.EXTERNAL_INFERENCE_ENABLED !== "true" || env.BOT_DECISION_CALL_CAP !== "1000") throw new Error("Fresh explicit 960-request authorization and shared 1000 ceiling required");
  for (const key of ["TYPESAFE_API_KEY", "LLM_API_KEY"]) if (!env[key]?.trim() || /^(your_|placeholder|test[-_]?key)/i.test(env[key]!)) throw new Error("Real Jev/OpenRouter credentials required");
  if (env.LLM_API_ENDPOINT !== "https://openrouter.ai/api/v1/chat/completions") throw new Error("Exact OpenRouter endpoint required");
}
export class Ledger {
  readonly slots: { entry: Entry; requests: number; row: Row | null }[] = [];
  private stopped = false;
  constructor(readonly path: string, readonly manifest: { plan: Entry[] }, readonly cap = 1000) {
    if (cap !== 1000 || manifest.plan.length !== 960 || existsSync(path)) throw new Error("Invalid allocation or existing non-replayable run");
    durableWrite(path, { manifest, cap, slots: [] }, true);
  }
  save() { durableWrite(this.path, { manifest: this.manifest, cap: this.cap, stopped: this.stopped, slots: this.slots }); }
  reserve(entry: Entry) {
    if (this.stopped || this.slots.length >= Math.min(960, this.cap) || this.slots.some(s => s.requests !== 1 || !s.row || s.row.failure) || digest(entry) !== digest(this.manifest.plan[this.slots.length])) throw new Error("Stopped, exhausted, concurrent or out-of-plan request");
    const slot = { entry, requests: 0, row: null as Row | null }; this.slots.push(slot); this.save(); return slot;
  }
  request(slot: typeof this.slots[number]) {
    if (this.stopped || !this.slots.includes(slot) || slot !== this.slots.at(-1) || slot.requests !== 0 || slot.row) throw new Error("Retries or parallel requests forbidden");
    slot.requests = 1; this.save();
  }
  complete(slot: typeof this.slots[number], input: unknown) {
    const row = rowSchema.parse(input);
    if (!this.slots.includes(slot) || slot.requests !== 1 || slot.row || row.id !== slot.entry.id || row.provider !== slot.entry.provider || row.menu !== slot.entry.menu || row.fixture !== slot.entry.fixture || row.repetition !== slot.entry.repetition) throw new Error("Mismatched observation");
    slot.row = row; this.stopped = !!row.failure; this.save();
  }
  stop() { this.stopped = true; this.save(); }
}
