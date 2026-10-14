import { afterEach, describe, it } from "vitest";
import { isDeepStrictEqual } from "node:util";
import { eevoBotDescriptor, getBotCatalog } from "@/lib/bots/registry";
import type { BotRegistry } from "@/lib/bots/registry";
import { BotProviderError, emptyDiagnostics, type BotContext, type BotDecision } from "@/lib/bots/types";
import { stepBotAction } from "@/lib/poker/bot-turn-service";
import { getPublicGame, startNextHand } from "@/lib/poker/game-service";
import { BotStepForbiddenError } from "@/lib/poker/driver-authorization";
import { BotStepInProgressError } from "@/lib/poker/bot-step-claims";
import { GameConflictError } from "@/lib/supabase/queries";
import { createSupabaseGameRepository } from "@/lib/supabase/server";
import { UsageLimitError } from "@/lib/usage/errors";
import { usagePolicy } from "@/lib/usage/policy";
import { pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import { PokerRuleError } from "@/lib/poker/types";
import { projectBotHistory } from "@/lib/poker/bot-history";
import { barrier, cleanupAll, fixture, invariant, passive, type Fixture } from "./harness";

const fixtures: Fixture[] = [];
afterEach(async () => {
  const completed = fixtures.splice(0);
  await cleanupAll(completed.map(f => f.cleanup));
  const mismatches = completed.flatMap(f => f.responseMismatches);
  invariant(mismatches.length === 0, "response matches authoritative action fields " + [...new Set(mismatches)].join(" "));
});
function newFixture() { const f = fixture(); fixtures.push(f); return f; }
const catalog = [...getBotCatalog(), eevoBotDescriptor];
const llm = catalog.find(bot => bot.provider === "llm")!;
const jev = catalog.find(bot => bot.provider === "typesafe")!;

async function rejectsAs(promise: Promise<unknown>, type: new (...args: never[]) => Error) {
  let error: unknown;
  try { await promise; } catch (caught) { error = caught; }
  invariant(error instanceof type, `expected ${type.name} propagated`);
}

function testRegistry(f: Fixture, id: string, decide?: (context: BotContext) => Promise<BotDecision>) {
  const captured: BotContext[] = [];
  let resolutions = 0;
  const registry: BotRegistry = {
    get(selection) {
      resolutions++;
      const descriptor = catalog.find(bot => bot.id === selection.botId);
      invariant(descriptor, "selected bot exists in real catalog");
      invariant(descriptor.configuration, "catalog configuration retained");
      invariant(descriptor.provider === "llm" ? ["balanced", "tight", "aggressive"].includes(selection.profileId ?? "") : selection.profileId == null, "selected profile matches provider");
      return { descriptor, bot: { async decide(context) {
        const { game, state, snapshot, actor } = await f.read(id);
        invariant(actor?.bot?.id === selection.botId && actor.botProfileId === selection.profileId, "selected descriptor and profile match persisted actor");
        invariant(context.hero.seat === actor.seat, "context hero matches current actor");
        invariant(context.game.handNumber === snapshot.handNumber, "context hand matches persisted hand");
        invariant(isDeepStrictEqual(context.legalActions, engine.getLegalActions(state)), "context legality matches engine");
        invariant(isDeepStrictEqual(context.hero.holeCards, engine.heroCards(state, actor.id)), "context contains only hero holdings");
        invariant(context.opponents.every(opponent => !Object.hasOwn(opponent, "holeCards") && !Object.hasOwn(opponent, "id") && !Object.hasOwn(opponent, "name")), "context opponent privacy");
        invariant(!JSON.stringify(context).includes(f.owner), "context excludes ownership token");
        if (descriptor.provider !== "rules") {
          const session = await f.repository.getBotSessionContext(id, snapshot.handNumber);
          invariant(session?.version === game.version && session.currentHand?.handNumber === snapshot.handNumber, "session version and hand match inference");
          invariant(isDeepStrictEqual(context.actionHistory, projectBotHistory(session.currentHand, state, actor.id).actions), "persisted history delivered to decision");
          invariant(context.situation?.historyStatus === "complete", "current history parsed completely");
          invariant(context.sessionStats?.coverage.status === "complete", "session history parsed completely");
        }
        captured.push(context);
        return decide ? decide(context) : { action: passive(context.legalActions), diagnostics: emptyDiagnostics({ botProfileId: actor.botProfileId ?? null }), rawResponse: { fixtureOnly: true } };
      } } };
    },
  };
  return { registry, captured, get resolutions() { return resolutions; } };
}

async function verifiedStep(f: Fixture, id: string, registry: BotRegistry) {
  const before = await f.read(id);
  const counts = await f.counts(id);
  const response = await stepBotAction(f.repository, registry, id, before.game.version, f.owner);
  const after = await f.read(id);
  const next = await f.counts(id);
  invariant(after.game.version === before.game.version + 1 && next.actions === counts.actions + 1, "one action and version committed");
  invariant(next.claims === 0, "successful claim consumed");
  const external = before.actor?.bot?.provider !== "rules";
  invariant(next.owner === counts.owner + Number(external) && next.game === counts.game + Number(external), "one owner and game inference attempt charged");
  invariant(before.actor, "bot actor exists");
  const expected = engine.applyAction(before.state, before.actor.id, { type: response.aiDecision.action, ...(response.aiDecision.amount !== null ? { amount: response.aiDecision.amount } : {}) } as Parameters<typeof engine.applyAction>[2]);
  invariant(isDeepStrictEqual(after.state, expected), "persisted state is legal action result");
  const fresh = await getPublicGame(f.repository, id, f.owner);
  // Publication belongs to host discovery reads, not action responses.
  const authoritativeActionResponse = { ...fresh };
  delete authoritativeActionResponse.publication;
  // serverTime measures each response, rather than committed game state.
  invariant(Number.isFinite(Date.parse(response.game.serverTime ?? "")) && Number.isFinite(Date.parse(fresh.serverTime ?? "")), "response server timestamps valid");
  invariant(Math.abs(Date.parse(response.game.serverTime!) - Date.parse(fresh.serverTime!)) < 10_000, "response server timestamps within read deadline");
  const comparableResponse = { ...response.game, serverTime: fresh.serverTime };
  if (!isDeepStrictEqual(comparableResponse, authoritativeActionResponse)) {
    const paths: string[] = [];
    const diff = (a: unknown, b: unknown, path: string) => {
      if (isDeepStrictEqual(a, b)) return;
      if (a && b && typeof a === "object" && typeof b === "object") {
        const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
        for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) diff(left[key], right[key], `${path}.${/^[a-zA-Z0-9]+$/.test(key) ? key : "entry"}`);
      } else paths.push(path);
    };
    diff(comparableResponse, authoritativeActionResponse, "game");
    // Defer the failure until teardown so lifecycle coverage and cleanup finish.
    f.responseMismatches.push(...paths);
  }
  invariant(!JSON.stringify(response).includes("fixtureOnly"), "public response excludes provider payload");
  invariant(response.game.poker.players.every(player => player.playerToken == null || (player.controller === "human" && player.playerToken === f.owner)), "public response masks other ownership tokens");
  const spectator = await getPublicGame(f.repository, id, null);
  invariant(spectator, "spectator projection exists");
  invariant(!JSON.stringify(spectator).includes(f.owner), "spectator excludes ownership tokens");
  if (after.snapshot.street !== "complete") {
    invariant(spectator.poker.players.every(player => player.holeCards === null), "active spectator holdings hidden");
    invariant(response.game.poker.players.filter(player => player.controller === "bot").every(player => player.holeCards === null), "active bot holdings hidden from human");
    invariant(response.game.poker.players.find(player => player.controller === "human")?.holeCards?.length === 2, "owner sees own holdings");
  }
}

async function unchanged(f: Fixture, id: string, before: Awaited<ReturnType<Fixture["read"]>>, old: Awaited<ReturnType<Fixture["counts"]>>, charged: number) {
  const after = await f.read(id);
  const counts = await f.counts(id);
  invariant(isDeepStrictEqual(after.game, before.game), "failed step leaves persisted game unchanged");
  invariant(counts.actions === old.actions && counts.claims === 0, "failed step commits no action and releases claim");
  invariant(counts.owner === old.owner + charged && counts.game === old.game + charged, "failed step charges only admitted attempts");
}

describe("production external bot pipeline", () => {
  it.each(["Quick Play", "heads-up LLM", "heads-up TypeSafe", "heads-up Eevo"])("%s creation, first hand and next-hand session context", async mode => {
    const f = newFixture();
    const id = await f.create(mode === "Quick Play" ? undefined : mode === "heads-up LLM" ? llm : mode === "heads-up Eevo" ? eevoBotDescriptor : jev);
    const initial = await f.read(id);
    if (mode === "Quick Play") {
      invariant(initial.state.config.seatCount === 6 && initial.game.status === "playing", "Quick Play starts six-seat game");
      invariant(["llm", "typesafe"].every(provider => initial.state.config.players.some(player => player.bot?.provider === provider)), "Quick Play covers both external descriptors");
      invariant(initial.state.config.players.filter(player => player.bot).every(player => isDeepStrictEqual(player.bot, catalog.find(bot => bot.id === player.bot?.id))), "Quick Play descriptors retain configuration metadata");
    }
    const injected = testRegistry(f, id);
    for (let i = 0; i < 80; i++) {
      const current = await f.read(id);
      if (current.snapshot.street === "complete") break;
      if (current.actor?.controller === "human") await f.human(id);
      else await verifiedStep(f, id, injected.registry);
    }
    const completed = await f.read(id);
    invariant(completed.snapshot.street === "complete", "first hand completes within action bound");
    const history = await f.repository.getBotSessionContext(id, 1);
    invariant(history?.currentHand?.actions.length && history.currentHand.initialState, "completed first-hand history persisted and parsed");
    invariant(projectBotHistory(history.currentHand, completed.state, "").status === "complete", "completed first-hand actions replay to authoritative state");
    await startNextHand(f.repository, id, completed.game.version, f.owner);
    const nextSession = await f.repository.getBotSessionContext(id, 2);
    invariant(nextSession?.previousHands.length === 1 && nextSession.previousHands[0].handNumber === 1 && nextSession.previousHands[0].finalState, "next session contains completed historical final state");
    invariant(isDeepStrictEqual(nextSession.previousHands[0].finalState, completed.state), "historical final state matches completed first hand");
    let testedExternal = false;
    for (let i = 0; i < 20; i++) {
      const current = await f.botTurn(id);
      const external = current.actor?.bot?.provider !== "rules";
      await verifiedStep(f, id, injected.registry);
      if (external) { testedExternal = true; break; }
    }
    invariant(testedExternal, "next hand delivers external decision");
    const context = injected.captured.at(-1)!;
    invariant(context.game.handNumber === 2 && context.sessionStats?.coverage.validatedHands === 1, "next-hand context includes validated first hand");
    if (mode !== "Quick Play") invariant(context.situation?.dealtPlayerCount === 2 && context.situation.buttonIsSmallBlind, "heads-up context delivered");
  });

  it("action response seat ordering matches the authoritative snapshot after moving the host", async () => {
    const f = newFixture();
    const id = await f.create(llm, 1);
    await f.botTurn(id);
    await verifiedStep(f, id, testRegistry(f, id).registry);
  });

  it.each([llm, eevoBotDescriptor])("separate clients compete behind a decision barrier with one inference charge ($id)", async descriptor => {
    const f = newFixture(); const id = await f.create(descriptor);
    const before = await f.botTurn(id); const old = await f.counts(id);
    const entered = barrier(); const resume = barrier();
    const injected = testRegistry(f, id, async context => {
      entered.release(); await resume.promise;
      return { action: passive(context.legalActions), diagnostics: emptyDiagnostics(), rawResponse: null };
    });
    const first = verifiedStep(f, id, injected.registry);
    first.catch(() => {});
    try {
      await entered.promise;
      invariant((await f.counts(id)).claims === 1, "inference holds one database claim");
      await rejectsAs(stepBotAction(createSupabaseGameRepository(), injected.registry, id, before.game.version, f.owner), BotStepInProgressError);
      invariant(injected.captured.length === 1 && injected.resolutions === 1, "competitor never resolves or decides");
    } finally { entered.release(); resume.release(); await first; }
    const next = await f.counts(id);
    invariant(next.actions === old.actions + 1 && next.owner === old.owner + 1 && next.game === old.game + 1 && next.claims === 0, "competition commits and charges once");
    invariant((await f.read(id)).game.version === before.game.version + 1, "competition advances one version");
  });

  it.each([jev, eevoBotDescriptor])("unauthorized and stale steps never resolve bots or consume allowances ($id)", async descriptor => {
    const f = newFixture(); const id = await f.create(descriptor);
    const before = await f.botTurn(id); const old = await f.counts(id); const injected = testRegistry(f, id);
    await rejectsAs(stepBotAction(f.repository, injected.registry, id, before.game.version, "unowned-fixture"), BotStepForbiddenError);
    await rejectsAs(stepBotAction(f.repository, injected.registry, id, before.game.version - 1, f.owner), GameConflictError);
    invariant(injected.resolutions === 0 && injected.captured.length === 0, "rejected steps never reach registry or decide");
    await unchanged(f, id, before, old, 0);
  });

  it("legal external fold commits through the engine and consumes one claim and charge", async () => {
    const f = newFixture(); const id = await f.create(jev);
    await f.botTurn(id);
    const injected = testRegistry(f, id, async context => {
      invariant(context.legalActions.some(action => action.type === "fold"), "fold is engine legal");
      return { action: { type: "fold" }, diagnostics: emptyDiagnostics(), rawResponse: null };
    });
    await verifiedStep(f, id, injected.registry);
    invariant((await f.read(id)).snapshot.street === "complete", "heads-up fold completes hand");
  });

  it("illegal decision releases claim and preserves admitted inference charge", async () => {
    const f = newFixture(); const id = await f.create(llm);
    const before = await f.botTurn(id); const old = await f.counts(id);
    const injected = testRegistry(f, id, async () => ({ action: { type: "raise", amount: -1 }, diagnostics: emptyDiagnostics(), rawResponse: null }));
    await rejectsAs(stepBotAction(f.repository, injected.registry, id, before.game.version, f.owner), PokerRuleError);
    invariant(injected.captured.length === 1, "illegal decision runs once");
    await unchanged(f, id, before, old, 1);
  });

  it.each([llm, eevoBotDescriptor])("provider failure propagates without automatic retry; explicit retry charges again ($id)", async descriptor => {
    const f = newFixture(); const id = await f.create(descriptor);
    const before = await f.botTurn(id); const old = await f.counts(id);
    const failure = new BotProviderError("Simulated fixture failure");
    const injected = testRegistry(f, id, async () => { throw failure; });
    let caught: unknown;
    try { await stepBotAction(f.repository, injected.registry, id, before.game.version, f.owner); } catch (error) { caught = error; }
    invariant(caught === failure && injected.captured.length === 1, "provider failure propagates exactly once");
    await unchanged(f, id, before, old, 1);
    await verifiedStep(f, id, testRegistry(f, id).registry);
    invariant((await f.counts(id)).owner === old.owner + 2, "explicit retry charges second attempt");
  });

  it.each([jev, eevoBotDescriptor])("exhausted fixture allowance denies inference and cleans up claim ($id)", async descriptor => {
    const f = newFixture(); const id = await f.create(descriptor);
    const before = await f.botTurn(id);
    const exhausted = await f.client.from("usage_allowances").upsert({ key: `inference:game:${id}`, attempts: Array.from({ length: usagePolicy.gameAI.allowance }, () => new Date().toISOString()), last_seen: new Date().toISOString() });
    invariant(!exhausted.error, "fixture allowance exhausted");
    const old = await f.counts(id); const injected = testRegistry(f, id);
    await rejectsAs(stepBotAction(f.repository, injected.registry, id, before.game.version, f.owner), UsageLimitError);
    invariant(injected.captured.length === 0, "allowance denial never reaches decide");
    await unchanged(f, id, before, old, 0);
  });

  it("fixture teardown removes committed creation after a simulated harness failure", async () => {
    const f = newFixture(); const id = await f.create(llm);
    try { throw new Error("Simulated fixture failure"); } catch { await f.cleanup(); }
    invariant(await f.repository.getGame(id) === null, "failure cleanup removes game");
    // Suite teardown repeats cleanup to verify idempotency.
  });
});
