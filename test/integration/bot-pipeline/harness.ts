import { randomUUID } from "node:crypto";
import { createSupabaseGameRepository, createSupabaseServerClient } from "@/lib/supabase/server";
import { creationAttemptArguments } from "@/lib/poker/creation-attempt";
import { createDemoGame, createQuickPlayGame, startGame, submitHumanAction } from "@/lib/poker/game-service";
import { assignBotToSeat, claimSeat } from "@/lib/poker/seat-service";
import { hashUsageIdentity } from "@/lib/usage/identity";
import { restorePersistedState } from "@/lib/poker/persisted-state";
import { pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import type { BotDescriptor, LegalAction, PokerAction } from "@/lib/poker/types";
import { assertLocalOrigin } from "./network";

export function invariant(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(`Pipeline invariant: ${label}`);
}

export async function cleanupAll(cleanups: readonly (() => Promise<void>)[]): Promise<void> {
  let failed = false;
  for (const cleanup of cleanups) {
    try { await cleanup(); } catch { failed = true; }
  }
  invariant(!failed, "fixture cleanup completed");
}

export function barrier(timeoutMs = 10_000) {
  let release!: () => void;
  let timer: ReturnType<typeof setTimeout>;
  const promise = new Promise<void>((resolve, reject) => {
    release = () => { clearTimeout(timer); resolve(); };
    timer = setTimeout(() => reject(new Error("Pipeline invariant: decision barrier completed before deadline")), timeoutMs);
  });
  // A failed test may release without ever awaiting the barrier.
  promise.catch(() => {});
  return { promise, release };
}

export function passive(legal: readonly LegalAction[]): PokerAction {
  for (const type of ["check", "call", "fold"] as const) {
    if (legal.some(action => action.type === type)) return { type };
  }
  throw new Error("Pipeline invariant: actor has a passive legal action");
}

export function fixture() {
  assertLocalOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const client = createSupabaseServerClient();
  const repository = createSupabaseGameRepository();
  const owner = randomUUID();
  const attempt = creationAttemptArguments(new Request("http://localhost/"), owner, randomUUID(), { mode: "quick" });
  const keys = new Set([
    `creation:owner:${hashUsageIdentity("owner", owner)}`,
    `creation:ip:${hashUsageIdentity("ip", "127.0.0.1")}`,
    `inference:owner:${hashUsageIdentity("owner", owner)}`,
  ]);
  const ids = new Set<string>();
  const responseMismatches: string[] = [];
  const check = (error: unknown) => invariant(!error, "fixture database operation succeeded");
  async function cleanup() {
    // Discover by our unique host even when creation committed before response parsing failed.
    let discoveryFailed = false;
    try {
      const hosts = await client.from("game_hosts").select("game_id").eq("host_token", owner);
      discoveryFailed = Boolean(hosts.error);
      for (const row of hosts.data ?? []) ids.add(row.game_id);
    } catch { discoveryFailed = true; }
    const tasks: (() => Promise<void>)[] = [async () => { invariant(!discoveryFailed, "fixture discovery completed"); }];
    for (const id of ids) {
      keys.add(`inference:game:${id}`);
      for (const table of ["hand_card_reveals", "actions", "hands"] as const) {
        tasks.push(async () => { check((await client.from(table).delete().eq("game_id", id)).error); });
      }
      tasks.push(async () => { check((await client.from("games").delete().eq("id", id)).error); });
      for (const table of ["game_hosts", "game_players", "bot_step_claims", "hands", "actions", "hand_card_reveals"] as const) {
        tasks.push(async () => {
          const result = await client.from(table).select("game_id").eq("game_id", id);
          check(result.error);
          invariant(result.data?.length === 0, "fixture game dependents removed");
        });
      }
      tasks.push(async () => { invariant(await repository.getGame(id) === null, "fixture game removed"); });
    }
    tasks.push(async () => { check((await client.from("creation_attempts").delete().eq("owner_hash", attempt.p_owner)).error); });
    tasks.push(async () => { check((await client.from("usage_allowances").delete().in("key", [...keys])).error); });
    tasks.push(async () => {
      const remaining = await client.from("usage_allowances").select("key").in("key", [...keys]);
      check(remaining.error);
      invariant(remaining.data?.length === 0, "fixture allowances removed");
    });
    tasks.push(async () => {
      const attempts = await client.from("creation_attempts").select("attempt_id").eq("owner_hash", attempt.p_owner);
      check(attempts.error);
      invariant(attempts.data?.length === 0, "fixture creation attempts removed");
    });
    await cleanupAll(tasks);
  }

  async function create(bot?: BotDescriptor, humanSeat = 0) {
    const intent = bot ? { mode: "custom" as const, seatCount: 2, humanTurnSeconds: null } : { mode: "quick" as const };
    const writer = createSupabaseGameRepository(creationAttemptArguments(new Request("http://localhost/"), owner, attempt.p_attempt_id, intent));
    const created = bot
      ? await createDemoGame(writer, { hostToken: owner, hostName: "Pipeline fixture", seatCount: 2, humanTurnSeconds: null })
      : await createQuickPlayGame(writer, { hostToken: owner, hostName: "Pipeline fixture" });
    ids.add(created.gameId);
    keys.add(`inference:game:${created.gameId}`);
    if (bot) {
      let version = created.version;
      if (humanSeat === 1) {
        await claimSeat(repository, { gameId: created.gameId, seat: 1, playerToken: owner, expectedVersion: version });
        const moved = await repository.getGame(created.gameId);
        invariant(moved, "moved host table persisted");
        version = moved.version;
      }
      await assignBotToSeat(repository, { gameId: created.gameId, seat: humanSeat === 1 ? 0 : 1, hostToken: owner, expectedVersion: version, bot, botProfileId: bot.provider === "llm" ? "tight" : null });
      const game = await repository.getGame(created.gameId);
      invariant(game, "custom table persisted");
      await startGame(repository, created.gameId, game.version, owner);
    }
    return created.gameId;
  }
  async function read(id: string) {
    const game = await repository.getGame(id);
    invariant(game, "game persisted");
    const state = restorePersistedState(game.currentState);
    const snapshot = engine.snapshot(state);
    const actor = state.config.players.find(player => player.id === snapshot.currentActorId);
    return { game, state, snapshot, actor };
  }
  async function human(id: string) {
    const { game, state, actor } = await read(id);
    invariant(actor?.controller === "human", "current actor is human");
    await submitHumanAction(repository, id, { expectedVersion: game.version, playerId: owner, action: passive(engine.getLegalActions(state)) });
  }
  async function botTurn(id: string) {
    for (let i = 0; i < 20; i++) {
      const current = await read(id);
      invariant(current.snapshot.street !== "complete", "bot turn reached before completion");
      if (current.actor?.controller === "bot") return current;
      await human(id);
    }
    throw new Error("Pipeline invariant: bot turn reached within action bound");
  }
  async function counts(id: string) {
    const actions = await client.from("actions").select("id", { count: "exact", head: true }).eq("game_id", id);
    check(actions.error);
    const claims = await client.from("bot_step_claims").select("game_id").eq("game_id", id);
    check(claims.error);
    const usage = await client.from("usage_allowances").select("key,attempts").in("key", [`inference:owner:${hashUsageIdentity("owner", owner)}`, `inference:game:${id}`]);
    check(usage.error);
    return { actions: actions.count ?? 0, claims: claims.data?.length ?? 0,
      owner: usage.data?.find(row => row.key.startsWith("inference:owner:"))?.attempts.length ?? 0,
      game: usage.data?.find(row => row.key.startsWith("inference:game:"))?.attempts.length ?? 0 };
  }
  return { client, repository, owner, create, read, human, botTurn, counts, cleanup, responseMismatches };
}
export type Fixture = ReturnType<typeof fixture>;
