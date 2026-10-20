import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { hash } from "../preflop-action-value/integrity";
import { cells, sizes, type Spec, type Selection } from "./config";
import { materialize, type Row } from "./experiment";
import { pokerEngineAdapter as engine } from "@/lib/poker/adapter";
export { acquire } from "../preflop-candidate/storage";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const specSchema = z.object({ id: z.string(), phase: z.enum(["development", "confirmation"]), hand: z.enum(["AA", "KK"]), combo: z.number().int().min(0).max(5), handNumber: z.union([z.literal(1), z.literal(2), z.literal(7), z.literal(16)]), replicate: z.number().int().nonnegative() }).strict();
const outcomeSchema = z.object({ valueBB: z.number().min(-99.5).max(100.5), rootResponse: z.string(), flop: z.boolean(), showdown: z.boolean(), heroLaterChips: z.number().int().nonnegative().max(199), opponentLaterChips: z.number().int().nonnegative().max(198), actions: z.number().int().min(2).max(200), terminalStacks: z.array(z.number().int().min(0).max(400)).length(2), traceHash: digest }).strict();
const rowSchema = z.object({ spec: specSchema, deckHash: digest, samples: z.literal(5000), outcomes: z.record(z.string(), z.record(z.string(), outcomeSchema)), failure: z.string().nullable(), failedArm: z.string().nullable() }).strict();
const checkpoint = z.object({ manifestHash: digest, selectionHash: digest, row: rowSchema }).strict();
export function parse(bytes: Buffer, manifestHash: string, spec: Spec, selection: Selection): Row {
  const d = checkpoint.parse(JSON.parse(gunzipSync(bytes).toString()));
  if (d.manifestHash !== manifestHash || d.selectionHash !== hash(JSON.stringify(selection)) || JSON.stringify(d.row.spec) !== JSON.stringify(spec)) throw new Error("Incompatible checkpoint");
  const fixture = materialize(spec);
  if (d.row.deckHash !== fixture.deckHash) throw new Error("Checkpoint deal mismatch");
  const view = engine.decisionView(fixture.state), heroIndex = view.players.findIndex(p => p.id === fixture.heroId);
  const startStack = view.players[heroIndex].stack;
  const roots = spec.phase === "development" ? [200, ...sizes] : [200, selection[spec.hand]];
  if (roots.some(r => r === undefined)) throw new Error("Missing selection");
  if (d.row.failure !== null) { if (Object.keys(d.row.outcomes).length || !d.row.failedArm) throw new Error("Invalid failed block"); }
  else {
    if (d.row.failedArm !== null || Object.keys(d.row.outcomes).sort().join() !== cells.map(c => c.id).sort().join()) throw new Error("Incomplete cells");
    for (const outcomes of Object.values(d.row.outcomes)) {
      if (Object.keys(outcomes).sort().join() !== roots.map(String).sort().join()) throw new Error("Incomplete arms");
      for (const o of Object.values(outcomes)) if (o.terminalStacks.reduce((a, b) => a + b, 0) !== 400 || (o.showdown && !o.flop) || o.valueBB !== (o.terminalStacks[heroIndex] - startStack) / 2) throw new Error("Invalid terminal state");
    }
  }
  return d.row;
}
export function save(path: string, manifestHash: string, row: Row, selection: Selection) {
  const bytes = gzipSync(JSON.stringify({ manifestHash, selectionHash: hash(JSON.stringify(selection)), row }));
  parse(bytes, manifestHash, row.spec, selection);
  if (existsSync(path)) {
    if (!isDeepStrictEqual(parse(readFileSync(path), manifestHash, row.spec, selection), row)) throw new Error("Checkpoint differs");
    return;
  }
  const tmp = `${path}.${randomUUID()}.tmp`; writeFileSync(tmp, bytes, { flag: "wx" }); renameSync(tmp, path);
}
