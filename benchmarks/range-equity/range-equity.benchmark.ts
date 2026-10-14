import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { expect, it } from "vitest";
import { z } from "zod";
import { calculateRangeEquity } from "./calculator";
import { FIXTURE_VERSION, fixtures } from "./fixtures";
import { calculateShowdownEquity } from "../baselines/random-equity-v1";

const oracleSchema = z.object({ pokerkitVersion: z.literal("0.7.7"), inputSha256: z.string(), rows: z.array(z.object({
  id: z.string(), method: z.enum(["exact-river", "independent-monte-carlo"]), showdownShare: z.number().min(0).max(1),
  sampleCount: z.number().int().positive(), standardError: z.number().nonnegative(), attempts: z.number().int().positive(),
})) });
it("reports conditional sensitivity, independent accuracy, latency and convergence", () => {
  mkdirSync("benchmarks/results", { recursive: true });
  const fixtureBytes = JSON.stringify(fixtures, null, 2) + "\n";
  const fixturePath = "benchmarks/results/range-equity-fixtures-v1.json";
  writeFileSync(fixturePath, fixtureBytes);
  const hash = createHash("sha256").update(fixtureBytes).digest("hex");
  let oraclePath = "benchmarks/range-equity/pokerkit-oracle-v1.json";
  if (process.env.POKERKIT_PYTHON) {
    oraclePath = "benchmarks/results/range-equity-pokerkit.json";
    const child = spawnSync(process.env.POKERKIT_PYTHON, ["benchmarks/range-equity/pokerkit-oracle.py", fixturePath, oraclePath],
      { encoding: "utf8", timeout: 300_000, env: { PATH: process.env.PATH, NODE_ENV: "test", PYTHONNOUSERSITE: "1" } });
    if (child.error || child.status !== 0) throw new Error(`PokerKit offline check failed: ${child.stderr}`);
    console.log(child.stdout.trim());
  }
  const oracle = oracleSchema.parse(JSON.parse(readFileSync(oraclePath, "utf8")));
  expect(oracle.inputSha256).toBe(hash);
  expect(oracle.rows.map(row => row.id).sort()).toEqual(fixtures.filter(fixture => fixture.oracle).map(fixture => fixture.id).sort());
  const rows = fixtures.flatMap(fixture => {
    const reference = oracle.rows.find(row => row.id === fixture.id);
    const exact = fixture.input.board.length === 5 ? calculateRangeEquity(fixture.input) : null;
    return [1000, 5000, 20000].map(sampleBudget => {
      const start = performance.now();
      const result = calculateRangeEquity({ ...fixture.input, mode: "monte-carlo", sampleBudget });
      const milliseconds = performance.now() - start;
      expect(result.status).toBe("supported");
      if (result.status !== "supported") throw new Error(`Unsupported fixture: ${fixture.id}`);
      const truth = exact?.status === "supported" && exact.method === "exact-river" ? exact.showdownShare : reference?.showdownShare;
      const error = truth === undefined ? null : result.showdownShare - truth;
      // Union-bound Hoeffding for independent bounded shares; exact has no sampling uncertainty.
      const tolerance = Math.sqrt(Math.log(80) / (2 * sampleBudget)) +
        (reference?.method === "independent-monte-carlo" ? Math.sqrt(Math.log(80) / (2 * reference.sampleCount)) : 0);
      if (error !== null) expect(Math.abs(error)).toBeLessThanOrEqual(tolerance);
      if (exact?.status === "supported" && exact.method === "exact-river" && reference?.method === "exact-river") {
        expect(exact.showdownShare).toBeCloseTo(reference.showdownShare, 12);
      }
      return { id: fixture.id, opponentCount: fixture.input.opponents.length, requestedSamples: sampleBudget,
        result, milliseconds, reference: reference ?? null, exact: exact?.status === "supported" && exact.method === "exact-river" ? exact : null,
        referenceError: error, comparisonTolerance: tolerance };
    });
  });
  const uniformComparison = [1, 2, 3, 4, 5].map(opponentCount => {
    const fixture = fixtures.find(item => item.id === (opponentCount === 1 ? "preflop-broad" : `uniform-${opponentCount}-opponents`))!;
    const range = rows.find(row => row.id === fixture.id && row.requestedSamples === 20000)!;
    const randomEquity = calculateShowdownEquity({ heroHoleCards: fixture.input.hero, communityCards: fixture.input.board,
      opponentCount, sampleCount: 20000, seed: `frozen-baseline-v1:${opponentCount}` });
    expect(Math.abs(range.result.showdownShare - randomEquity)).toBeLessThan(2 * Math.sqrt(Math.log(80) / 40000) + 0.0001);
    return { opponentCount, randomEquity, rangeEquity: range.result.showdownShare, difference: range.result.showdownShare - randomEquity };
  });
  const report = { fixtureVersion: FIXTURE_VERSION, fixtureSha256: hash, seedProtocol: "fixed fixture seed at each sample budget",
    sourceSha256: Object.fromEntries(["benchmarks/range-equity/calculator.ts", "benchmarks/range-equity/showdown.ts",
      "benchmarks/range-equity/fixtures.ts", "benchmarks/range-equity/pokerkit-oracle.py", "lib/poker/adapter.ts",
      "benchmarks/baselines/random-equity-v1.ts"].map(path => [path, createHash("sha256").update(readFileSync(path)).digest("hex")])),
    nodeVersion: process.version, engineVersion: "1.0.1", baselineSha256: createHash("sha256").update(readFileSync("benchmarks/baselines/random-equity-v1.ts")).digest("hex"),
    oracle, rows, uniformComparison, interpretation: "Conditional showdown share; no range inference, GTO reference, side-pot chip EV or playing-strength claim." };
  writeFileSync("benchmarks/results/range-equity-v1.json", JSON.stringify(report, null, 2) + "\n");
  console.table(rows.map(row => ({ fixture: row.id, opponents: row.opponentCount, samples: row.requestedSamples,
    share: row.result.showdownShare.toFixed(4), se: row.result.standardError.toFixed(4), ms: Math.round(row.milliseconds), error: row.referenceError?.toFixed(4) })));
}, 600_000);
