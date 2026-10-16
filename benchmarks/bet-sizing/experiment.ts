import { z } from "zod";
import { pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { selectPokerAdvice } from "@/lib/poker/strategy-advice";
import { SystemOneResponseError } from "@/lib/systemone/types";
import type { PokerBot } from "@/lib/bots/types";
import { createMoveOptions } from "@/lib/systemone/questions";
import { diagnostics, failure } from "../bot-audit/providers";
import { digest } from "../bot-audit/safety";
import { fixtures, menus, fixtureVersion } from "./fixtures";
import { providers } from "./providers";

export const version = "bet-sizing-v1";
export const screening = { repetitions: 10, minimumFixtures: 2, minimumSelections: 3, requiresCompletedPilot: true, strengthClaim: false } as const;
export function prepare(samples = 5000) {
  const matrix = fixtures(samples);
  const plan: { id: string; provider: typeof providers[number]; menu: typeof menus[number]; fixture: string; repetition: number; inputHash: string }[] = [];
  for (let repetition = 0; repetition < 10; repetition++) for (let j = 0; j < matrix.length; j++) {
    const f = matrix[(j + repetition) % matrix.length];
    for (let k = 0; k < 6; k++) {
      const provider = providers[(k + repetition + j) % 2];
      const menu = menus[(Math.floor(k / 2) + repetition + j) % 3];
      plan.push({ id: `decision-${plan.length}`, provider, menu, fixture: f.id, repetition, inputHash: digest(f.variants[menu]) });
    }
  }
  if (plan.length !== 960) throw new Error("Incorrect prescribed allocation");
  return { matrix, plan, version, fixtureVersion, screening };
}
export type Entry = ReturnType<typeof prepare>["plan"][number];
const actionSchema = z.discriminatedUnion("type", [z.object({ type: z.literal("check") }).strict(), z.object({ type: z.literal("fold") }).strict(), z.object({ type: z.literal("call"), amount: z.number().optional() }).strict(), z.object({ type: z.literal("bet"), amount: z.number() }).strict(), z.object({ type: z.literal("raise"), amount: z.number() }).strict()]);
export const rowSchema = z.object({ id: z.string(), provider: z.enum(providers), menu: z.enum(menus), fixture: z.string(), repetition: z.number().int().min(0).max(9), control: z.boolean(), addedAvailable: z.boolean(), omission: z.string(), addedSelected: z.boolean(), action: actionSchema.nullable(), sizing: z.string().nullable(), payment: z.number().nullable(), potFraction: z.number().nullable(), stackFraction: z.number().nullable(), latencyMs: z.number().nonnegative(), cost: z.number().nonnegative().nullable(), model: z.string().nullable(), revision: z.string().nullable(), policy: z.string().nullable(), failure: z.string().nullable(), failureStage: z.enum(["provider", "invariant", "engine"]).nullable() }).strict();
export type Row = z.infer<typeof rowSchema>;
export async function observe(bot: PokerBot, entry: Entry, prepared: ReturnType<typeof prepare>): Promise<Row> {
  const f = prepared.matrix.find(f => f.id === entry.fixture);
  if (!f || digest(f.variants[entry.menu]) !== entry.inputHash) throw new Error("Frozen input mismatch");
  const availability = f.availability.find(a => a.menu === entry.menu)!;
  const { inputHash: _inputHash, ...identity } = entry; void _inputHash;
  const row: Row = { ...identity, control: !!f.control, addedAvailable: availability.reason === "available", omission: availability.reason, addedSelected: false, action: null, sizing: null, payment: null, potFraction: null, stackFraction: null, latencyMs: 0, cost: null, model: null, revision: null, policy: null, failure: null, failureStage: null };
  const started = performance.now(); let stage: Row["failureStage"] = "provider";
  try {
    const decision = await bot.decide(structuredClone(f.context));
    const d = diagnostics(decision);
    row.cost = d.cost; row.revision = d.model; row.model = entry.provider === "jev" ? "jev-latest" : "openai/gpt-5.4-mini"; row.policy = d.policy;
    stage = "invariant";
    if (entry.provider === "llm" && d.model !== row.model) throw new Error("Unexpected returned model");
    const moves = createMoveOptions(f.variants[entry.menu], entry.menu);
    const selected = moves.find(m => JSON.stringify(m.action) === JSON.stringify(decision.action));
    if (!selected) throw new Error("Unavailable candidate");
    const sizing = selected.sizingChoice === "not_applicable" ? null : selected.sizingChoice;
    if ((decision.diagnostics.sizing?.choice ?? null) !== sizing) throw new Error("Sizing diagnostics disagree");
    const expected = { ...f.variants[entry.menu], strategyAdvice: selectPokerAdvice(f.variants[entry.menu]) };
    if (digest(decision.suppliedContext) !== digest(expected)) throw new Error("Displayed input disagreement");
    stage = "engine";
    engine.applyAction(f.state, engine.snapshot(f.state).currentActorId!, decision.action);
    row.action = decision.action; row.sizing = decision.diagnostics.sizing?.choice ?? null;
    row.addedSelected = row.addedAvailable && row.sizing === availability.choice;
    row.payment = decision.action.type === "bet" || decision.action.type === "raise" ? decision.action.amount - f.context.hero.investedThisStreet : decision.action.type === "call" ? decision.action.amount ?? 0 : 0;
    row.potFraction = row.payment / f.context.hand.pot;
    row.stackFraction = f.context.analysis.effectiveStack > 0 ? row.payment / f.context.analysis.effectiveStack : null;
  } catch (error) { row.failure = stage === "provider" ? error instanceof SystemOneResponseError ? "invalid_response" : failure(error) : stage; row.failureStage = stage; }
  row.latencyMs = Math.round(performance.now() - started);
  return rowSchema.parse(row);
}
