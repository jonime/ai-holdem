import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import policyFreeze from "../evidence/jev-hu-freeze-2026-10-14.json";
import { JevPokerBot } from "@/lib/bots/jev";
import { BotProviderError, emptyDiagnostics, type BotContext, type PokerBot } from "@/lib/bots/types";
import type { TypesafeDecisionClient } from "@/lib/typesafe/decision";
import { TypesafeResponseError } from "@/lib/typesafe/types";
import type { PokerGameState } from "@/lib/poker/types";
import type { BotHandContext } from "@/lib/poker/bot-history";
import { playEvaluationHand } from "../poker-context-harness";
import { sanitizedDiagnostics } from "../heads-up-pilot";
import { sampleEntry, seededRandom, type Match, type Reference } from "./reference";

export const experimentVersion = "jev-hu-evaluation-v1";
export class BudgetExhausted extends Error {}
export class RequestBudget {
  used = 0;
  readonly allocations = { decisions: 0, memory: 0, matches: 0 };
  constructor(readonly cap: number, private readonly onReserve: () => void = () => {}) { if (!Number.isSafeInteger(cap) || cap < 1 || cap > 1000) throw new Error("Cap must be 1–1000"); }
  reserve(section: keyof RequestBudget["allocations"]) {
    const limit = { decisions: 240, memory: 108, matches: 652 }[section];
    if (this.used >= this.cap || this.allocations[section] >= limit) throw new BudgetExhausted();
    this.used++; this.allocations[section]++; this.onReserve();
  }
  client(client: TypesafeDecisionClient, section: keyof RequestBudget["allocations"]): TypesafeDecisionClient {
    return { evaluate: request => { this.reserve(section); return client.evaluate(request); } };
  }
}
export function failureCategory(error: unknown) {
  if (error instanceof BudgetExhausted) return "budget";
  if (error instanceof BotProviderError) return error.category;
  if (error instanceof TypesafeResponseError) return "invalid_response";
  return "invariant";
}
/** Freeze by content hashes: refuse comparisons if any policy dependency changes. */
export function verifyFreeze(manifest: Readonly<Record<string, string>>) {
  for (const [file, expected] of Object.entries(manifest)) {
    if (createHash("sha256").update(readFileSync(file)).digest("hex") !== expected) throw new Error(`Frozen policy/fixture changed: ${file}`);
  }
}
export interface Coverage { covered: number; avoided: number; unsupported: Record<string, number>; advisory: { covered: number; unsupported: Record<string, number> } }
/** Chart data are never placed on BotContext; the client injects an EV-free advice field. */
export function chartVariants(client: TypesafeDecisionClient, data: Reference, resolve: (context: BotContext) => Match, random: () => number) {
  verifyFreeze(policyFreeze.files);
  const coverage: Coverage = { covered: 0, avoided: 0, unsupported: {}, advisory: { covered: 0, unsupported: {} } };
  const current = new JevPokerBot(client);
  const advisory = new JevPokerBot({ evaluate(request) {
    const match = resolve(request.state as BotContext);
    if (match.supported) coverage.advisory.covered++;
    else coverage.advisory.unsupported[match.reason] = (coverage.advisory.unsupported[match.reason] ?? 0) + 1;
    const advice = match.supported ? { version: experimentVersion, dataVersion: data.dataVersion,
      source: { url: data.source.url, revision: data.source.revision }, assumptions: match.node.assumptions,
      opponentRange: match.node.opponentRange, limitations: data.source.limitations,
      frequencies: match.entry.actions.map(({ action, frequency }) => ({ action, frequency })) } : null;
    return client.evaluate({ ...request, state: { ...request.state as BotContext, ...(advice ? { benchmarkChartAdvice: advice } : {}) } });
  } });
  const hybrid: PokerBot = { async decide(context) {
    const match = resolve(context);
    if (!match.supported) { coverage.unsupported[match.reason] = (coverage.unsupported[match.reason] ?? 0) + 1; return current.decide(context); }
    coverage.covered++; coverage.avoided++;
    return { action: sampleEntry(match.entry, context.game.bigBlind, random), rawResponse: null,
      diagnostics: emptyDiagnostics({ promptVersion: `${experimentVersion}:${data.dataVersion}:sampler` }) };
  } };
  return { current, advisory, hybrid, coverage };
}
export interface MatchRow { block: number; challenger: string; opponent: string; policy: "current" | "challenger"; rotation: number; seed: number; profitBB: number | null; failure: string | null; diagnostics: ReturnType<typeof sanitizedDiagnostics>[] }
/** Four hands share a shuffled deck and 100 BB stacks; prior-session history is empty. */
export async function pairedMatches(current: PokerBot, challengers: Readonly<Record<string, PokerBot>>, opponents: Readonly<Record<string, PokerBot>>, blocks: number,
  progress: (rows: readonly MatchRow[]) => void = () => {}, beforeSubject?: (state: PokerGameState, history: BotHandContext, context: BotContext) => void, equitySamples = 5000) {
  const rows: MatchRow[] = [];
  const names = Object.keys(opponents);
  if (!names.length || !Number.isSafeInteger(blocks) || blocks < 0) throw new Error("Require opponents and a nonnegative block count");
  let exhausted = false;
  for (let block = 0; block < blocks && !exhausted; block++) {
    const opponent = names[block % names.length];
    for (const [challenger, bot] of Object.entries(challengers)) {
      if (exhausted) break;
      for (const policy of ["current", "challenger"] as const) for (const rotation of [0, 1]) {
        const row: MatchRow = { block, challenger, opponent, policy, rotation, seed: 10001 + block, profitBB: null, failure: null, diagnostics: [] };
        rows.push(row);
        if (exhausted) { row.failure = "budget"; continue; }
        try {
          const result = await playEvaluationHand(policy === "current" ? current : bot, opponents[opponent], 2, rotation, row.seed, "facts", { equitySamples, emptySession: true, beforeSubject });
          row.profitBB = result.profitBB; row.diagnostics = result.diagnostics.map(sanitizedDiagnostics);
        } catch (error) { row.failure = failureCategory(error); if (error instanceof BudgetExhausted) exhausted = true; }
        progress(rows);
      }
    }
  }
  return { rows, summaries: summarizeMatches(rows), exhausted };
}
function bootstrap(blocks: readonly number[]) {
  if (blocks.length < 2) return null;
  const random = seededRandom(8765), means: number[] = [];
  for (let n = 0; n < 2000; n++) { let sum = 0; for (let i = 0; i < blocks.length; i++) sum += blocks[Math.floor(random() * blocks.length)]; means.push(sum / blocks.length); }
  means.sort((a, b) => a - b);
  return [means[50], means[1950]];
}
export function summarizeMatches(rows: readonly MatchRow[]) {
  return [...new Set(rows.map(r => `${r.challenger}:${r.opponent}`))].map(key => {
    const selected = rows.filter(r => `${r.challenger}:${r.opponent}` === key);
    const blocks = [...new Set(selected.map(r => r.block))].map(id => selected.filter(r => r.block === id));
    const complete = blocks.filter(b => b.length === 4 && b.every(r => r.profitBB !== null) && new Set(b.map(r => `${r.policy}:${r.rotation}`)).size === 4);
    const mean = (values: readonly number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    const profits = (policy: MatchRow["policy"]) => complete.map(b => b.filter(r => r.policy === policy).reduce((sum, r) => sum + r.profitBB!, 0) / 2 * 100);
    const differences = complete.map(b => (b.filter(r => r.policy === "challenger").reduce((sum, r) => sum + r.profitBB!, 0) - b.filter(r => r.policy === "current").reduce((sum, r) => sum + r.profitBB!, 0)) / 2 * 100);
    return { key, attemptedBlocks: blocks.length, completeBlocks: complete.length, excludedBlocks: blocks.length - complete.length,
      completionRate: selected.length ? selected.filter(r => r.profitBB !== null).length / selected.length : 0,
      currentBB100: mean(profits("current")), challengerBB100: mean(profits("challenger")), pairedDifferenceBB100: mean(differences),
      bootstrap95BB100: bootstrap(differences), exploratory: complete.length < 30 };
  });
}
