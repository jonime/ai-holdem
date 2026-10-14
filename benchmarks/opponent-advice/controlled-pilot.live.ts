import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { TypesafeSystemOneClient } from "@/lib/typesafe/client";
import { verifyFreeze } from "../heads-up/experiment";
import manifest from "./freeze-v2-live.json";
import { controlledAdviceFixtures, controlledFixtureVersion } from "./controlled-fixtures";
import { adviceVersion } from "./advice";
import { evaluatePilot, livePilotBots, preflight, summarizePilot, model, type PilotRow } from "./pilot";
import { networkPreflight, stopAfterFailure } from "./run-safety";

it.skipIf(process.env.BOT_SCENARIO_LIVE !== "true")("runs the newly authorized corrected 960-call pilot with connectivity and early-stop guards", async () => {
  verifyFreeze(manifest.files);
  const budget = preflight(), cap = budget.remaining;
  if (cap !== 960 || process.env.OPPONENT_ADVICE_V2_AUTHORIZATION !== "plan-3-v2-960") throw new Error("Require the separately authorized v2 960-call allocation");
  await networkPreflight();
  const fixtures = controlledAdviceFixtures(), inputs = fixtures.map(f => ({ id: f.id, contexts: f.contexts }));
  const inputHash = createHash("sha256").update(JSON.stringify(inputs)).digest("hex");
  const path = "benchmarks/results/opponent-advice-v2-live.json";
  if (existsSync(path) || existsSync(`${path}.started`)) throw new Error("This paid run has already been attempted");
  mkdirSync("benchmarks/results", { recursive: true });
  writeFileSync(`${path}.started`, inputHash + "\n", { flag: "wx" });
  writeFileSync(`${path}.manifest.json`, JSON.stringify({ fixtureVersion: controlledFixtureVersion, adviceVersion, files: manifest.files, inputHash, inputs, providers: { jev: "jev-latest", llm: model, reasoning: "low", playstyle: "balanced" }, cap, independentAuthorization: "960 additional calls", connectivityPreflight: "HEAD without credentials or inference", earlyStop: "first provider failure; no retry" }, null, 2) + "\n");
  let rows: PilotRow[] = [], stopReason: string | null = null;
  const report = () => ({ fixtureVersion: controlledFixtureVersion, adviceVersion, inputHash, cap, attempts: cap - budget.remaining, stopReason, rows, summary: summarizePilot(rows) });
  const save = () => { writeFileSync(`${path}.tmp`, JSON.stringify(report(), null, 2) + "\n"); renameSync(`${path}.tmp`, path); };
  const guarded = stopAfterFailure(livePilotBots(new TypesafeSystemOneClient(), budget, save));
  try { rows = await evaluatePilot(guarded.bots, fixtures, partial => { rows = [...partial]; stopReason = guarded.failure(); save(); }); }
  finally { stopReason = guarded.failure(); save(); }
  expect(report().attempts).toBeLessThanOrEqual(960);
  expect(stopReason).toBeNull(); expect(rows).toHaveLength(960); expect(rows.every(r => r.action !== null && r.failure === null)).toBe(true);
}, 43_200_000);
