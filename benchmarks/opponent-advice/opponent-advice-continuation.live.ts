/** Continue unattempted cells after sandbox network failures; never replay recorded cells. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { TypesafeSystemOneClient } from "@/lib/typesafe/client";
import type { BotContext } from "@/lib/bots/types";
import { verifyFreeze } from "../heads-up/experiment";
import manifest from "./freeze.json";
import { adviceFixtures, fixtureVersion } from "./fixtures";
import { adviceVersion } from "./advice";
import { evaluatePilot, livePilotBots, preflight, summarizePilot, policies, providers, type PilotRow } from "./pilot";

it.skipIf(process.env.BOT_SCENARIO_LIVE !== "true")("continues only unattempted authorized cells within the original 960 cap", async () => {
  verifyFreeze(manifest.files);
  const priorPath = "benchmarks/results/opponent-advice-live.json";
  const prior = JSON.parse(readFileSync(priorPath, "utf8"));
  const priorRows: PilotRow[] = prior.rows;
  if (prior.cap !== 960 || prior.attempts !== 721 || priorRows.length !== 721 || priorRows.some(row => row.action !== null || row.failure !== "network")) throw new Error("Unexpected prior ledger; refuse spending");
  const budget = preflight();
  if (budget.remaining !== prior.cap - prior.attempts) throw new Error("Continuation must use the remaining original cap");
  const allocation = budget.remaining, fixtures = adviceFixtures();
  const inputs = fixtures.map(f => ({ id: f.id, contexts: f.contexts }));
  const inputHash = createHash("sha256").update(JSON.stringify(inputs)).digest("hex");
  if (inputHash !== prior.inputHash) throw new Error("Frozen input mismatch");
  const path = "benchmarks/results/opponent-advice-live-continued.json";
  if (existsSync(path) || existsSync(`${path}.started`)) throw new Error("Continuation already attempted");
  mkdirSync("benchmarks/results", { recursive: true });
  writeFileSync(`${path}.started`, inputHash + "\n", { flag: "wx" });
  writeFileSync(`${path}.manifest.json`, JSON.stringify({ priorPath, priorReportSha256: createHash("sha256").update(readFileSync(priorPath)).digest("hex"), inputHash, originalCap: 960, priorAttempts: prior.attempts, continuationAllocation: allocation, files: manifest.files, runnerSha256: createHash("sha256").update(readFileSync("benchmarks/opponent-advice/opponent-advice-continuation.live.ts")).digest("hex") }, null, 2) + "\n");
  let rows = [...priorRows], traversed = 0;
  const report = () => ({ fixtureVersion, adviceVersion, inputHash, cap: 960, attempts: prior.attempts + allocation - budget.remaining, priorAttempts: prior.attempts, continuationAttempts: allocation - budget.remaining, rows, summary: summarizePilot(rows) });
  const save = () => writeFileSync(path, JSON.stringify(report(), null, 2) + "\n");
  const live = livePilotBots(new TypesafeSystemOneClient(), budget, save);
  const bots = Object.fromEntries(providers.map(provider => [provider, Object.fromEntries(policies.map(policy => [policy, { decide(context: BotContext) {
    if (traversed++ < prior.attempts) throw new Error("Previously recorded cell; no request");
    return live[provider][policy].decide(context);
  } }]))])) as typeof live;
  try {
    const result = await evaluatePilot(bots, fixtures, partial => { rows = [...priorRows, ...partial.slice(prior.attempts)]; save(); });
    rows = [...priorRows, ...result.slice(prior.attempts)];
  } finally { save(); }
  expect(report().attempts).toBeLessThanOrEqual(960);
  expect(rows).toHaveLength(960);
}, 43_200_000);
