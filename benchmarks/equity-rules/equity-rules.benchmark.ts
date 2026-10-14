import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { expect, it } from "vitest";
import { compare, difficulties, opponents } from "./experiment";
import { fixedCoverage, rangeSensitivity } from "./coverage";
import { POLICY_VERSION } from "./challenger";

it("runs the frozen/facts/structured ablation with whole-block pairing", async () => {
  const blocks = Number(process.env.RULES_BLOCKS ?? 500), samples = Number(process.env.RULES_EQUITY_SAMPLES ?? 100);
  if (!Number.isInteger(blocks) || blocks < 1 || blocks > 5000 || !Number.isInteger(samples) || samples < 1 || samples > 20000)
    throw new Error("Invalid experimental budget");
  mkdirSync("benchmarks/results", { recursive: true });
  const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
  const sourcePaths = ["lib/poker/adapter.ts", "lib/poker/decision-facts.ts", "lib/poker/bot-history.ts",
    "benchmarks/poker-context-harness.ts", "benchmarks/policy-harness.ts", "benchmarks/scenarios/harness.ts", "benchmarks/scenarios/everyday.ts",
    "benchmarks/range-equity/calculator.ts", "benchmarks/range-equity/showdown.ts", "benchmarks/range-equity/fixtures.ts",
    ...readdirSync("benchmarks/equity-rules").filter(p => p.endsWith(".ts") || p.endsWith(".mjs")).map(p => `benchmarks/equity-rules/${p}`),
    ...readdirSync("benchmarks/equity-rules/frozen").map(p => `benchmarks/equity-rules/frozen/${p}`)];
  const report = { policyVersion: POLICY_VERSION, blocks, equitySamples: samples, seedProtocol: "LCG shuffled full deck; seeds 1..blocks, identical seat/deck assignments across variants",
    sourceSha256: Object.fromEntries(sourcePaths.map(path => [path, hash(path)])),
    limitations: ["random-hand equity is not betting-range equity", "scripted opponents are not GTO", "100BB no-rake independent hands; not table-session win rate", "latency separates context and decisions; identical equity/exact-river results memoized across variants and groups"],
    fixed: await fixedCoverage(samples), rangeSensitivity: rangeSensitivity(), matches: [] as Awaited<ReturnType<typeof compare>>[], elapsedMs: 0 };
  const start = performance.now();
  const save = () => { report.elapsedMs = performance.now() - start; writeFileSync("benchmarks/results/equity-rules-v1.json", JSON.stringify(report, null, 2) + "\n"); };
  save();
  const jobs = opponents.flatMap(opponent => difficulties.flatMap(difficulty => [2, 6].map(seats => ({ opponent, difficulty, seats, blocks, samples }))));
  const parallelism = 6;
  await Promise.all(Array.from({ length: parallelism }, async () => {
    while (jobs.length) {
      const job = jobs.shift()!;
      const start = performance.now();
      const match = await new Promise<Awaited<ReturnType<typeof compare>>>((resolve, reject) => {
        const worker = new Worker(new URL("./worker.mjs", import.meta.url), { workerData: job,
          env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" } });
        let delivered = false;
        worker.once("message", result => { delivered = true; resolve(result); });
        worker.once("error", reject);
        worker.once("exit", code => { if (!delivered) reject(new Error(`Benchmark worker exited ${code}`)); });
      });
      report.matches.push(match);
      report.matches.sort((a,b) => opponents.indexOf(a.opponent)-opponents.indexOf(b.opponent) || difficulties.indexOf(a.difficulty)-difficulties.indexOf(b.difficulty) || a.seats-b.seats);
      save();
      console.log(JSON.stringify({ ...job, completeBlocks: match.completeBlocks, excluded: match.excluded.length, paired: match.paired, elapsedMs: performance.now() - start }));
    }
  }));
  expect(report.matches).toHaveLength(18);
  expect(report.matches.every(match => match.excluded.length === 0)).toBe(true);
}, 7_200_000);
