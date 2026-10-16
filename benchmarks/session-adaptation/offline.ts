import assert from "node:assert/strict";
import { pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { ServerBotRegistry } from "@/lib/bots/registry";
import { emptyDiagnostics, type PokerBot } from "@/lib/bots/types";
import { createMoveOptions } from "@/lib/systemone/questions";
import { ConfidenceAwareJevPokerBot } from "@/lib/bots/jev-confidence";
import { ConfidenceAwareEevoPokerBot } from "@/lib/bots/eevo-confidence";
import { selectJevOpponentAdvice } from "@/lib/poker/opponent-advice";
import { projectSessionStats } from "@/lib/poker/session-stats";
import type { BotHandContext } from "@/lib/poker/bot-history";
import type { PokerAction } from "@/lib/poker/types";
import type { SystemOneRequest } from "@/lib/systemone/types";
import { scriptedAnswer } from "../bet-sizing/providers";
import { blocks, contextFor, episodes, playHand, start } from "./session";
export async function offline(samples = 5000, hands = 60) {
  const block = blocks[0], arms = episodes(block), rules = new ServerBotRegistry().get({ botId: "equity-rules-v2" }).bot;
  let decisions = 0, adviceActive = 0, responsive = 0, parity = 0, negative = 0;
  const progress = (message: string) => console.log(`[offline] ${message}`);
  // This subject creates ordinary opportunities by opening/betting; after natural
  // observations become usable it selects normal half-pot pressure when offered.
  const subject: PokerBot = { async decide(context) {
    decisions++;
    const advice = selectJevOpponentAdvice(context); adviceActive += Number(advice.length > 0);
    const enabled = context.sessionStats;
    const { sessionStats: _stats, ...omitted } = context; void _stats;
    assert.equal(selectJevOpponentAdvice(omitted).length, 0);
    if (decisions % 25 === 1) {
      assert.deepEqual((await rules.decide(context)).action, (await rules.decide(omitted)).action); negative++;
      let jevRequest: SystemOneRequest | undefined, eevoRequest: SystemOneRequest | undefined;
      const client = (capture: (r: SystemOneRequest) => void) => ({ async evaluate(request: SystemOneRequest) { capture(request); return scriptedAnswer(request, Object.keys(request.questions.move.criteria)[0]); } });
      const a = await new ConfidenceAwareJevPokerBot(client(r => { jevRequest = r; })).decide(context);
      const b = await new ConfidenceAwareEevoPokerBot(client(r => { eevoRequest = r; })).decide(context);
      assert.deepEqual(a.action, b.action); assert.deepEqual(jevRequest?.state, eevoRequest?.state); assert.deepEqual(jevRequest?.questions, eevoRequest?.questions); parity++;
    }
    const moves = createMoveOptions(context), aggressive = moves.filter(m => m.action.type === "raise" || m.action.type === "bet");
    const selected = (advice.length ? aggressive.find(m => m.sizingChoice === (context.hand.street === "preflop" ? "two_and_half_big_blinds" : "one_half_pot")) : null) ?? aggressive[0] ?? moves.find(m => m.action.type === "call") ?? moves.find(m => m.action.type === "check") ?? moves[0];
    responsive += Number(advice.length > 0 && selected !== aggressive[0]);
    if (enabled) assert.equal(enabled.coverage.validatedHands, enabled.coverage.selectedHands);
    return { action: selected.action, diagnostics: emptyDiagnostics(), rawResponse: null };
  } };
  for (let hand = 1; hand <= hands; hand++) {
    // All four build independent histories; no recorded state or action crosses arms.
    for (const arm of arms) await playHand(arm, block, hand, { decide: c => subject.decide(c), decision() {}, completed() {} }, samples);
    if (hand % 5 === 0 || hand === 1) progress(`hand ${hand}/${hands} × four episodes; decisions ${decisions}; advice-active ${adviceActive}`);
  }
  const positive = positiveControl(samples);
  assert.ok(positive.activated > 0 && positive.changed > 0, "Naturally accumulated positive-control observations must change decisions");
  for (const arm of arms) {
    const state = start(arm, block, hands + 1), history = { version: 0, handNumber: hands + 1, initialState: state, actions: [] };
    // Current actor may be the script; projector tests identity regardless.
    const projected = projectSessionStats({ gameId: arm.id, version: 0, currentHand: history, previousHands: arm.history.slice(-50) }, state, "subject");
    assert.equal(projected.coverage.selectedHands, Math.min(50, hands)); assert.equal(projected.coverage.status, "complete");
    assert.throws(() => projectSessionStats({ gameId: arm.id, version: 0, currentHand: history, previousHands: [...arm.history.slice(-49), { ...history, finalState: state }] }, state, "subject"));
    if (engine.snapshot(state).currentActorId === "subject") {
      const context = contextFor(arm, state, history, samples);
      assert.equal("sessionStats" in context, arm.memory);
    }
  }
  return { version: "session-adaptation-v1", handsPerEpisode: hands, episodes: 4, equitySamples: samples, providerRequests: 0, positiveControl: positive, decisions, adviceActive, responsive, negativeControlChecks: negative, jevEevoScriptedParityChecks: parity, interpretation: "Offline pipeline evidence only; scripted subjects are not playing-strength evidence; no paid Eevo calls." };
}

/** Separate measurement control, with real complete raise/fold histories. The
 * control opponent always folds; it is never an opponent in the paid schedule. */
export function positiveControl(samples = 5000) {
  const block = blocks[0], arm = episodes(block)[0];
  let activated = 0, changed = 0;
  for (let hand = 1; hand <= 55; hand++) {
    let state = start(arm, block, hand); const initialState = state;
    const actions: BotHandContext["actions"][number][] = [];
    if (engine.snapshot(state).currentActorId === "subject") {
      const context = contextFor(arm, state, { version: 0, handNumber: hand, initialState, actions }, samples);
      const advice = selectJevOpponentAdvice(context);
      const action: PokerAction = { type: "raise", amount: advice.length ? 5 : 4 };
      activated += Number(advice.length > 0); changed += Number(action.amount === 5);
      actions.push({ sequence: 1, action, stateBefore: state }); state = engine.applyAction(state, "subject", action);
    }
    // Opponent opens on its button, otherwise faces the subject's open. Subject
    // folds to opponent opens. Every history is a valid ordinary complete hand.
    if (!actions.length) { const action: PokerAction = { type: "raise", amount: 5 }; actions.push({ sequence: 1, action, stateBefore: state }); state = engine.applyAction(state, "opponent", action); }
    const action: PokerAction = { type: "fold" }; actions.push({ sequence: 2, action, stateBefore: state }); state = engine.applyAction(state, engine.snapshot(state).currentActorId!, action);
    arm.history.push({ version: 0, handNumber: hand, initialState, actions, finalState: state }); arm.state = state;
  }
  const state = start(arm, block, 56), currentHand = { version: 0, handNumber: 56, initialState: state, actions: [] };
  const stats = projectSessionStats({ gameId: arm.id, version: 0, currentHand, previousHands: arm.history.slice(-50) }, state, "subject");
  assert.equal(stats.coverage.validatedHands, 50); assert.equal(stats.coverage.status, "complete");
  return { completedHands: 55, rollingValidated: stats.coverage.validatedHands, activated, changed };
}
