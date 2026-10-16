import assert from "node:assert/strict";
import { pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { createMoveOptions, createPokerDecisionRequest } from "@/lib/systemone/questions";
import { ConfidenceAwareJevPokerBot } from "@/lib/bots/jev-confidence";
import { ConfidenceAwareEevoPokerBot } from "@/lib/bots/eevo-confidence";
import { LlmPokerBot } from "@/lib/bots/llm";
import { prepareProviderContext } from "@/lib/poker/provider-context";
import { selectPokerAdvice } from "@/lib/poker/strategy-advice";
import { withConfidenceOpponentAdvice } from "@/lib/poker/opponent-advice";
import type { SystemOneRequest } from "@/lib/systemone/types";
import { digest } from "../bot-audit/safety";
import { prepare } from "./experiment";
import { scriptedAnswer } from "./providers";
import { menus } from "./fixtures";

/** Real wrappers and LLM schema/parser, scripted transport only; never calls a provider. */
export async function offline(samples = 5000) {
  const p = prepare(samples), rows = [];
  const env = { EXTERNAL_INFERENCE_ENABLED: process.env.EXTERNAL_INFERENCE_ENABLED, LLM_API_KEY: process.env.LLM_API_KEY, LLM_API_ENDPOINT: process.env.LLM_API_ENDPOINT };
  Object.assign(process.env, { EXTERNAL_INFERENCE_ENABLED: "true", LLM_API_KEY: "scripted-offline-key", LLM_API_ENDPOINT: "https://openrouter.ai/api/v1/chat/completions" });
  try {
    for (const f of p.matrix) for (const menu of menus) {
      const context = f.variants[menu], moves = createMoveOptions(context, menu), availability = f.availability.find(a => a.menu === menu)!;
      for (const m of moves) engine.applyAction(f.state, engine.snapshot(f.state).currentActorId!, m.action);
      const selected = moves.find(m => availability.reason === "available" && m.sizingChoice === availability.choice) ?? moves[0];
      let jevRequest: SystemOneRequest | undefined, eevoRequest: SystemOneRequest | undefined;
      const jev = await new ConfidenceAwareJevPokerBot({ async evaluate(r) { jevRequest = r; return scriptedAnswer(r, selected.choice); } }, true, "jev-latest", menu).decide(f.context);
      const eevo = await new ConfidenceAwareEevoPokerBot({ async evaluate(r) { eevoRequest = r; return scriptedAnswer(r, selected.choice); } }, menu).decide(f.context);
      assert.deepEqual(jevRequest?.state, eevoRequest?.state); assert.deepEqual(jevRequest?.questions, eevoRequest?.questions);
      assert.deepEqual(jevRequest?.state, { ...withConfidenceOpponentAdvice(context), strategyAdvice: selectPokerAdvice(context) });
      assert.deepEqual(jev.action, selected.action); assert.deepEqual(eevo.action, selected.action);
      const llm = await new LlmPokerBot("openai/gpt-5.4-mini", { menu, profileId: "balanced", reasoning: "low" }, async (_url, init) => {
        const request = JSON.parse(String(init.body));
        assert.deepEqual(JSON.parse(request.messages[1].content), context);
        assert.deepEqual(request.response_format.json_schema.schema.properties.sizing.enum, [...context.sizingOptions.filter(s => s.amount !== null).map(s => s.choice), null]);
        return new Response(JSON.stringify({ model: "openai/gpt-5.4-mini", choices: [{ message: { content: JSON.stringify({ action: selected.action.type, sizing: selected.sizingChoice === "not_applicable" ? null : selected.sizingChoice }) } }] }));
      }).decide(f.context);
      assert.deepEqual(llm.action, selected.action);
      assert.deepEqual(prepareProviderContext(f.context).sizingOptions, f.variants.current.sizingOptions);
      assert.deepEqual(createPokerDecisionRequest(context, "jev-latest", menu).questions, jevRequest?.questions);
      rows.push({ fixture: f.id, menu, inputHash: digest(context), condition: f.condition, availability, candidates: moves.map(m => m.choice), scriptedAction: selected.action, jevEevoParity: true, llmAgreement: true, engineChecked: moves.length });
    }
  } finally { for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
  return { version: p.version, equitySamples: samples, requests: 0, plannedRequests: p.plan.length, rows, interpretation: "Offline compatibility only; scripted choices provide no behavioral or strength evidence." };
}
