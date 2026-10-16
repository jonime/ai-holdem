import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { blocks, type Block } from "./session";
import { combined, digest, fileHash, prepareContinuation, validateContinuation, type ContinuationManifest } from "./continuation";
import { type Evidence, type Limits } from "./storage";
const amendment = "llm-only-after-quota-v1";
export interface LlmManifest { amendment: typeof amendment; manifestHash: string; previousLedger: string; previousLedgerHash: string; previousFreeze: string; previousFreezeHash: string; scheduled: Block[]; skipped: Block[]; limits: Limits; files: Record<string, string>; authorization: string }
export function llmSchedule(parent: Evidence) {
  if (parent.status !== "stopped" || parent.requests.length !== 1557 || parent.blocks.length !== 8) throw new Error("LLM amendment requires the stopped combined 1,557-reservation evidence");
  for (const [i, block] of parent.blocks.entries()) {
    const { status, ...identity } = block;
    if (!isDeepStrictEqual(identity, blocks[i]) || (i < 4 ? status !== (i % 2 === 0 ? "budget" : "failed") : status !== "pending")) throw new Error("Changed previous schedule or block status");
    const count = parent.requests.filter(r => r.block === block.id).length;
    if (count !== ([600, 289, 600, 68][i] ?? 0)) throw new Error("Changed previous request allocation");
    if (i >= 4 && (parent.hands.some(r => r.block === block.id) || parent.decisions.some(r => r.block === block.id) || parent.failures.some(r => r.block === block.id))) throw new Error("Pending block contains observations");
  }
  return { scheduled: blocks.slice(4).filter(b => b.provider === "llm"), skipped: blocks.slice(4).filter(b => b.provider === "jev") };
}
function previousEvidence(ledgerPath: string, freezePath: string) {
  const manifest: ContinuationManifest = JSON.parse(readFileSync(freezePath, "utf8"));
  const original = validateContinuation(manifest);
  return { evidence: combined(original, JSON.parse(readFileSync(ledgerPath, "utf8")), manifest), manifest };
}
export function prepareLlm(previousLedger: string, previousFreeze: string, files: Record<string, string>): LlmManifest {
  const previous = previousEvidence(previousLedger, previousFreeze);
  // Recheck every protected source against the original full offline study freeze.
  prepareContinuation(previous.manifest.parentLedger, previous.manifest.parentFreeze, files);
  const schedule = llmSchedule(previous.evidence);
  const body: Omit<LlmManifest, "manifestHash"> = { amendment, previousLedger, previousLedgerHash: fileHash(previousLedger), previousFreeze, previousFreezeHash: fileHash(previousFreeze), ...schedule, limits: { requestCap: 1200, priorRequests: 1557, combinedCap: 2757 }, files, authorization: "Human authorized only two untouched LLM blocks after quota increase. Four incomplete blocks excluded; two untouched Jev blocks skipped. No replay, replacement, transfer, or further continuation." };
  return { ...body, manifestHash: digest(body) };
}
export function validateLlm(manifest: LlmManifest): Evidence {
  const { manifestHash, ...body } = manifest;
  if (manifest.amendment !== amendment || digest(body) !== manifestHash || !isDeepStrictEqual(manifest.limits, { requestCap: 1200, priorRequests: 1557, combinedCap: 2757 })) throw new Error("Changed LLM amendment freeze or limits");
  if (fileHash(manifest.previousLedger) !== manifest.previousLedgerHash || fileHash(manifest.previousFreeze) !== manifest.previousFreezeHash) throw new Error("Previous continuation evidence changed");
  const parent = previousEvidence(manifest.previousLedger, manifest.previousFreeze).evidence;
  const expected = llmSchedule(parent);
  if (!isDeepStrictEqual(expected.scheduled, manifest.scheduled) || !isDeepStrictEqual(expected.skipped, manifest.skipped)) throw new Error("Changed LLM-only schedule");
  return parent;
}
export function combinedLlm(parent: Evidence, child: Evidence, manifest: LlmManifest): Evidence {
  const identity = child.blocks.map(({ status: _status, ...b }) => { void _status; return b; });
  if (child.manifestHash !== manifest.manifestHash || !isDeepStrictEqual(child.limits, manifest.limits) || !isDeepStrictEqual(identity, manifest.scheduled)) throw new Error("LLM ledger lineage mismatch");
  const allowed = new Set(manifest.scheduled.map(b => b.id));
  if (child.requests.length > 1200 || [...child.requests, ...child.hands, ...child.decisions, ...child.failures].some(r => !allowed.has(r.block)) || [...allowed].some(id => child.requests.filter(r => r.block === id).length > 600)) throw new Error("LLM-only allocation exceeded or replayed");
  return { ...parent, manifestHash: digest([parent.manifestHash, child.manifestHash]), limits: { requestCap: 2757, priorRequests: 0, combinedCap: 2757 }, status: child.status, failure: child.failure ?? parent.failure,
    blocks: parent.blocks.map(b => child.blocks.find(c => c.id === b.id) ?? (manifest.skipped.some(s => s.id === b.id) ? { ...b, status: "skipped" as const } : b)),
    requests: [...parent.requests, ...child.requests], hands: [...parent.hands, ...child.hands], decisions: [...parent.decisions, ...child.decisions], failures: [...parent.failures, ...child.failures] };
}
