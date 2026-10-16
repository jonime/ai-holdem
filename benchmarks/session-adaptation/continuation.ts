import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { blocks, design, type Block } from "./session";
import { type Evidence, type Limits } from "./storage";
export const amendment = "remaining-six-after-sleep-v1";
export const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const fileHash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
// Only execution, reporting and documentation may differ from the first freeze.
// Session construction, opponents, providers, production policies and dependencies
// retain their original hashes. New files are included in the amendment freeze.
const amendedFiles = new Set(["benchmarks/session-adaptation/run.mjs", "benchmarks/session-adaptation/live.ts", "benchmarks/session-adaptation/storage.ts", "benchmarks/session-adaptation/README.md", "benchmarks/session-adaptation/session.test.ts", "benchmarks/session-adaptation/report.ts", "package.json"]);
interface OriginalFreeze { manifestHash: string; design: unknown; blocks: Block[]; files: Record<string, string> }
export interface ContinuationManifest { amendment: typeof amendment; manifestHash: string; parentLedger: string; parentLedgerHash: string; parentFreeze: string; parentFreezeHash: string; parentManifestHash: string; priorRequests: number; scheduled: Block[]; limits: Limits; files: Record<string, string>; authorization: string }
export function eligible(parent: Evidence): Block[] {
  if (parent.version !== design.version || parent.status !== "stopped" || parent.requests.length !== 889 || parent.blocks.length !== 8) throw new Error("Amendment requires the stopped 889-reservation run");
  for (let i = 0; i < blocks.length; i++) { const { status: _status, ...block } = parent.blocks[i]; void _status; if (!isDeepStrictEqual(block, blocks[i])) throw new Error("Changed original schedule"); }
  const pending = parent.blocks.filter(b => b.status === "pending");
  if (pending.length !== 6 || parent.blocks[0].status !== "budget" || parent.blocks[1].status !== "failed" || parent.requests.filter(r => r.block === blocks[0].id).length !== 600 || parent.requests.filter(r => r.block === blocks[1].id).length !== 289) throw new Error("Amendment permits only the six untouched scheduled blocks");
  for (const b of pending) if (parent.requests.some(r => r.block === b.id) || parent.hands.some(h => h.block === b.id) || parent.decisions.some(d => d.block === b.id) || parent.failures.some(f => f.block === b.id)) throw new Error("Pending block contains prior evidence");
  return blocks.filter(b => pending.some(p => p.id === b.id));
}
export function prepareContinuation(parentLedger: string, parentFreeze: string, files: Record<string, string>): ContinuationManifest {
  const parent: Evidence = JSON.parse(readFileSync(parentLedger, "utf8"));
  const frozen: OriginalFreeze = JSON.parse(readFileSync(parentFreeze, "utf8"));
  const { manifestHash, ...body } = frozen;
  if (digest(body) !== manifestHash || parent.manifestHash !== manifestHash || !isDeepStrictEqual(frozen.design, design) || !isDeepStrictEqual(frozen.blocks, blocks)) throw new Error("Original freeze or lineage mismatch");
  for (const [path, hash] of Object.entries(frozen.files)) if (!amendedFiles.has(path) && fileHash(path) !== hash) throw new Error(`Original policy/source changed: ${path}`);
  const scheduled = eligible(parent);
  const manifest: Omit<ContinuationManifest, "manifestHash"> = { amendment, parentLedger, parentLedgerHash: fileHash(parentLedger), parentFreeze, parentFreezeHash: fileHash(parentFreeze), parentManifestHash: manifestHash, priorRequests: parent.requests.length, scheduled, limits: { requestCap: 3600, priorRequests: 889, combinedCap: 4489 }, files, authorization: "Human explicitly amended no-resumption rule for six untouched blocks; no replay, replacement, transfer, or further continuation authorized." };
  return { ...manifest, manifestHash: digest(manifest) };
}
export function validateContinuation(manifest: ContinuationManifest) {
  const { manifestHash, ...body } = manifest;
  if (manifest.amendment !== amendment || digest(body) !== manifestHash || manifest.limits.requestCap !== 3600 || manifest.limits.priorRequests !== 889 || manifest.limits.combinedCap !== 4489 || manifest.priorRequests !== 889) throw new Error("Changed amendment freeze or limits");
  if (fileHash(manifest.parentLedger) !== manifest.parentLedgerHash || fileHash(manifest.parentFreeze) !== manifest.parentFreezeHash) throw new Error("Original evidence changed after amendment");
  const parent: Evidence = JSON.parse(readFileSync(manifest.parentLedger, "utf8"));
  if (parent.manifestHash !== manifest.parentManifestHash || !isDeepStrictEqual(eligible(parent), manifest.scheduled)) throw new Error("Changed amendment schedule");
  return parent;
}
/** Read-only merge: original failed/budget blocks and unresolved request remain. */
export function combined(parent: Evidence, child: Evidence, manifest: ContinuationManifest): Evidence {
  if (child.manifestHash !== manifest.manifestHash || !isDeepStrictEqual(child.limits, manifest.limits) || !isDeepStrictEqual(child.blocks.map(({ status: _status, ...b }) => { void _status; return b; }), manifest.scheduled)) throw new Error("Continuation ledger lineage mismatch");
  const allowed = new Set(manifest.scheduled.map(b => b.id));
  if (child.requests.length > 3600 || child.requests.some(r => !allowed.has(r.block)) || child.hands.some(r => !allowed.has(r.block)) || child.decisions.some(r => !allowed.has(r.block)) || child.failures.some(r => !allowed.has(r.block))) throw new Error("Out-of-schedule continuation evidence");
  if ([...allowed].some(id => child.requests.filter(r => r.block === id).length > 600)) throw new Error("Block allocation exceeded");
  return { ...parent, status: child.status, failure: child.failure ?? parent.failure, limits: { requestCap: 4489, priorRequests: 0, combinedCap: 4489 }, manifestHash: digest([parent.manifestHash, child.manifestHash]), blocks: parent.blocks.map(b => child.blocks.find(c => c.id === b.id) ?? b), requests: [...parent.requests, ...child.requests], hands: [...parent.hands, ...child.hands], decisions: [...parent.decisions, ...child.decisions], failures: [...parent.failures, ...child.failures] };
}
