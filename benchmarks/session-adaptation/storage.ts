import { openSync, closeSync, writeFileSync, fsyncSync, renameSync, readFileSync } from "node:fs";
import type { Block, DecisionRow, HandRow } from "./session";
export interface Limits { requestCap: number; priorRequests: number; combinedCap: number }
export interface Evidence { limits?: Limits; version: string; manifestHash: string; status: "running" | "complete" | "stopped"; failure: string | null; failures: { block: string; episode: string; hand: number; category: string }[]; requests: { block: string; episode: string; hand: number; index: number; status: "reserved" | "completed" }[]; blocks: (Block & { status: "pending" | "running" | "complete" | "budget" | "failed" | "skipped" })[]; decisions: DecisionRow[]; hands: HandRow[] }
export function atomic(path: string, value: unknown) {
  const fd = openSync(path + ".tmp", "w", 0o600);
  try { writeFileSync(fd, JSON.stringify(value) + "\n"); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(path + ".tmp", path);
  const directory = openSync(path.substring(0, path.lastIndexOf("/")) || ".", "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
}
export class BudgetExhausted extends Error {}
export class Ledger {
  readonly evidence: Evidence;
  constructor(readonly path: string, blocks: Block[], manifestHash: string, readonly limits: Limits = { requestCap: 4800, priorRequests: 0, combinedCap: 4800 }) {
    if (![limits.requestCap, limits.priorRequests, limits.combinedCap].every(n => Number.isSafeInteger(n) && n >= 0) || limits.requestCap > blocks.length * 600 || limits.combinedCap > 4800 || limits.priorRequests + limits.requestCap > limits.combinedCap) throw new Error("Invalid request limits");
    // Permanent exclusive marker: never remove it, including after an interruption.
    const fd = openSync(path + ".started", "wx", 0o600); try { writeFileSync(fd, manifestHash); fsyncSync(fd); } finally { closeSync(fd); }
    this.evidence = { version: "session-adaptation-v1", limits, manifestHash, status: "running", failure: null, failures: [], requests: [], blocks: blocks.map(b => ({ ...b, status: "pending" })), decisions: [], hands: [] }; this.save();
  }
  save() { atomic(this.path, this.evidence); }
  reserve(block: string, episode: string, hand: number, index: number) {
    if (this.evidence.status !== "running" || this.evidence.requests.some(r => r.status === "reserved")) throw new Error("Run stopped or request already in flight");
    if (!this.evidence.blocks.some(b => b.id === block) || this.evidence.requests.some(r => r.episode === episode && r.hand === hand && r.index === index)) throw new Error("Unscheduled block or duplicate decision");
    if (this.evidence.requests.filter(r => r.block === block).length >= 600) throw new BudgetExhausted();
    if (this.evidence.requests.length >= this.limits.requestCap || this.limits.priorRequests + this.evidence.requests.length >= this.limits.combinedCap) throw new Error("Hard allocation exhausted");
    const slot = { block, episode, hand, index, status: "reserved" as const };
    this.evidence.requests.push(slot); this.save(); return this.evidence.requests.length - 1;
  }
  complete(index: number) { const slot = this.evidence.requests[index]; if (!slot || slot.status !== "reserved") throw new Error("Invalid reservation"); slot.status = "completed"; this.save(); }
}
export function load(path: string): Evidence { return JSON.parse(readFileSync(path, "utf8")); }
