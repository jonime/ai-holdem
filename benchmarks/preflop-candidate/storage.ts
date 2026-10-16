import { z } from "zod";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { hash } from "../preflop-action-value/integrity";
import type { BlockRow } from "./experiment";
import type { Spec } from "./fixtures";
import type { Selection } from "./candidate";
const specSchema = z.object({ id: z.string(), phase: z.enum(["screen", "confirm"]), target: z.enum(["medium-kk", "hard-qq"]), combo: z.number().int().min(0).max(5), handNumber: z.union([z.literal(1), z.literal(2), z.literal(7), z.literal(16)]), replicate: z.number().int().positive() }).strict();
const actionSchema = z.discriminatedUnion("type", [z.object({ type: z.literal("fold") }).strict(), z.object({ type: z.literal("check") }).strict(), z.object({ type: z.literal("call"), amount: z.number().int().nonnegative().optional() }).strict(), ...(["raise", "bet"] as const).map(type => z.object({ type: z.literal(type), amount: z.number().int().nonnegative() }).strict())]);
const rowSchema = z.object({ spec: specSchema, deckHash: z.string().regex(/^[a-f0-9]{64}$/), samples: z.literal(5000), baseline: actionSchema, branch: z.string().nullable(), treatment: z.boolean(), values: z.record(z.string(), z.record(z.string(), z.number())), uniqueRollouts: z.number().int().nonnegative().max(9), failure: z.enum(["action_limit", "rollout_failed"]).nullable() }).strict();
const checkpointSchema = z.object({ manifestHash: z.string(), row: rowSchema }).strict();
export function parseCheckpoint(bytes: Buffer, manifestHash: string, spec: Spec, selection: Selection): BlockRow {
  const parsed = checkpointSchema.parse(JSON.parse(gunzipSync(bytes).toString()));
  if (parsed.manifestHash !== manifestHash || JSON.stringify(parsed.row.spec) !== JSON.stringify(spec)) throw new Error("Checkpoint manifest/spec mismatch");
  const labels = spec.phase === "screen" ? ["baseline", "call", "raise3"] : ["baseline", selection[spec.target]];
  if (labels.some(l => l === undefined)) throw new Error("Missing confirmation selection");
  if (parsed.row.failure) { if (Object.keys(parsed.row.values).length) throw new Error("Failed block retained values"); }
  else {
    if (Object.keys(parsed.row.values).sort().join() !== "aggressive,frozen,passive") throw new Error("Checkpoint opponents incomplete");
    for (const value of Object.values(parsed.row.values)) if (Object.keys(value).sort().join() !== labels.sort().join() || Object.values(value).some(v => !Number.isFinite(v) || v < -100 || v > 500)) throw new Error("Checkpoint arm/value mismatch");
    if (!parsed.row.treatment && Object.values(parsed.row.values).some(o => Object.values(o).some(v => v !== o.baseline))) throw new Error("Non-treatment changed value");
  }
  return parsed.row;
}
export function saveCheckpoint(path: string, manifestHash: string, row: BlockRow, selection: Selection) {
  const bytes = gzipSync(JSON.stringify({ manifestHash, row }));
  parseCheckpoint(bytes, manifestHash, row.spec, selection);
  if (existsSync(path)) {
    const existing = parseCheckpoint(readFileSync(path), manifestHash, row.spec, selection);
    if (hash(JSON.stringify(existing)) !== hash(JSON.stringify(row))) throw new Error("Checkpoint already differs");
    return;
  }
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, bytes, { flag: "wx" }); renameSync(temporary, path);
}
const lockSchema = z.object({ pid: z.number().int().positive(), token: z.string(), host: z.string() }).strict();
function alive(pid: number) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") return false; throw new Error("Cannot verify coordinator owner"); }
}
export function acquire(path: string, probe: (pid: number) => boolean = alive) {
  const owner = { pid: process.pid, token: randomUUID(), host: hostname() };
  function create() { writeFileSync(path, JSON.stringify(owner), { flag: "wx" }); }
  try { create(); }
  catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "EEXIST") throw error;
    const recovery = `${path}.recovery`;
    writeFileSync(recovery, owner.token, { flag: "wx" });
    try {
      const prior = lockSchema.parse(JSON.parse(readFileSync(path, "utf8")));
      if (prior.host !== hostname()) throw new Error("Cannot recover foreign-host coordinator");
      if (probe(prior.pid)) throw new Error("Another coordinator is active");
      unlinkSync(path); create();
    } finally { unlinkSync(recovery); }
  }
  return () => { if (existsSync(path) && lockSchema.parse(JSON.parse(readFileSync(path, "utf8"))).token === owner.token) unlinkSync(path); };
}
