import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { buildPreflopNode, preflopNodes } from "../poker-context-harness";
import { specFromHistory, replay } from "../bot-audit/replay-adapter";
import { canonicalContext } from "../bot-improvements/canonical";
import { hash } from "../preflop-action-value/integrity";
import { configuration, hands } from "./config";
export const evidencePaths = ["benchmarks/bot-audit/live-evidence-2026-10-15.json.gz", "benchmarks/bot-improvements/live-evidence.json.gz", "benchmarks/bot-audit/freeze.json", "benchmarks/bot-improvements/freeze.json", "benchmarks/bot-improvements/plan.json"];
const entry = z.object({ id: z.string(), provider: z.string(), fixture: z.string(), inputHash: z.string(), repetition: z.number(), policyArm: z.string().optional() }).passthrough();
const observation = z.object({ provider: z.literal("jev"), hand: z.enum(hands), fixture: z.string(), model: z.literal("jev-1.13.0"), policy: z.literal("typesafe-poker-v4.1-confidence"), difficulty: z.literal("medium"), failure: z.null(), action: z.object({ type: z.literal("raise"), amountBB: z.literal(100) }), repetition: z.number() }).passthrough();
export function verifyEvidence() {
  const fixtures = hands.map(hand => {
    const f = buildPreflopNode(preflopNodes.find(n => n.id === "HU-open")!, [hand[0] + "s", hand[0] + "h"], "facts", configuration.equitySamples);
    const spec = specFromHistory(`HU-open-${hand}`, f.state, f.history), restored = replay(spec);
    const v = engine.decisionView(restored.state), hero = v.players.find(p => p.seat === v.currentActorSeat)!;
    if (v.currentActorSeat !== v.buttonSeat || v.currentActorSeat !== v.smallBlindSeat || v.handNumber !== 1 || spec.line.length || spec.config.smallBlind !== 1 || spec.config.bigBlind !== 2 || spec.config.players.some(p => p.stack !== 200)) throw new Error("Historical fixture mechanical mismatch");
    const after = engine.applyAction(restored.state, hero.id, { type: "raise", amount: 200 });
    if (engine.decisionView(after).players.find(p => p.id === hero.id)!.stack !== 0 || hero.stack !== 199) throw new Error("Historical total versus incremental amount mismatch");
    return { hand, spec, position: hero.position, effectiveStackBB: 100, rootTotalChips: 200, incrementalChips: 199,
      baselineInputHash: hash(JSON.stringify(f.context)), canonicalInputHash: hash(JSON.stringify(canonicalContext(f.context))) };
  });
  const observations: unknown[] = [];
  for (const path of evidencePaths.slice(0, 2)) {
    const archive = z.object({ manifest: z.object({ configuration: z.unknown(), plan: z.array(z.unknown()), files: z.record(z.string(), z.string()) }).passthrough(), slots: z.array(z.unknown()) }).passthrough().parse(JSON.parse(gunzipSync(readFileSync(path)).toString()));
    const freeze = JSON.parse(readFileSync(path.includes("bot-audit") ? evidencePaths[2] : evidencePaths[3], "utf8"));
    if (hash(JSON.stringify(archive.manifest.files)) !== hash(JSON.stringify(freeze.files))) throw new Error("Historical source manifest mismatch");
    const seen = new Set<string>();
    let count = 0;
    for (const unknownSlot of archive.slots) {
      const slot = z.object({ entry: entry.optional(), provider: z.string().optional(), fixture: z.string().optional() }).passthrough().parse(unknownSlot);
      const e = entry.parse(slot.entry ?? unknownSlot);
      if (e.provider !== "jev" || !/^HU-open-(AA|KK)$/.test(e.fixture)) continue;
      const planned = archive.manifest.plan.some(p => {
        const candidate = entry.omit({ id: true }).parse(p);
        return candidate.provider === e.provider && candidate.fixture === e.fixture && candidate.repetition === e.repetition && candidate.policyArm === e.policyArm && candidate.inputHash === e.inputHash;
      });
      const key = `${e.fixture}:${e.policyArm ?? "audit"}:${e.repetition}`;
      if (!planned || seen.has(key) || ![0, 1, 2].includes(e.repetition)) throw new Error("Historical allocation mismatch");
      seen.add(key);
      if (path.includes("bot-audit") && slot.status !== "completed") throw new Error("Historical slot incomplete");
      const raw = z.object({ requests: z.literal(1), observation: z.unknown().optional(), row: z.unknown().optional() }).passthrough().parse(unknownSlot);
      const row = observation.parse(raw.observation ?? raw.row), fixture = fixtures.find(f => f.hand === row.hand)!;
      if (row.fixture !== e.fixture || row.repetition !== e.repetition || e.inputHash !== (e.policyArm === "canonical" ? fixture.canonicalInputHash : fixture.baselineInputHash)) throw new Error("Historical observation input drift");
      observations.push({ path, entry: e, observation: row, configuredModels: archive.manifest.configuration }); count++;
    }
    if (count !== (path.includes("bot-audit") ? 6 : 12)) throw new Error("Historical observation count mismatch");
  }
  return { evidenceHashes: Object.fromEntries(evidencePaths.map(path => [path, hash(readFileSync(path))])), fixtures, observations, limitation: "18 historical requests motivate this investigation; no fresh model observations or return samples" };
}
