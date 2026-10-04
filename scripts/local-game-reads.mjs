/** Local-only SQL checks and HTTP read benchmark. Never uses application .env. */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const mode = process.argv[2];
assert(["test", "benchmark"].includes(mode), "Use test or benchmark");
const container = "supabase_db_ai-holdem";
const sqlArgs = ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"];
function sql(input) {
  return execFileSync("docker", sqlArgs, { input, encoding: "utf8", timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
}
// Status contains local credentials: keep them in memory, never print them.
const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
const origin = new URL(status.API_URL);
assert(["localhost", "127.0.0.1", "::1"].includes(origin.hostname), "Only local Supabase is allowed");
let requestCount = 0;
const headers = { apikey: status.SERVICE_ROLE_KEY, Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
async function request(path, body) {
  requestCount++;
  const response = await fetch(`${origin}rest/v1/${path}`, { headers, method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined, cache: "no-store", signal: AbortSignal.timeout(10000) });
  const text = await response.text();
  assert(response.ok, `Local database HTTP ${response.status}: ${text}`);
  return { data: JSON.parse(text), bytes: Buffer.byteLength(text) };
}
const snapshot = (id) => request("rpc/get_game_read_snapshot", { p_game_id: id });

function fixture(id, hands) {
  // Representative six-seat serialized engine-sized payload, constant across histories.
  const state = JSON.stringify({ stateSchemaVersion: 1,
    config: { smallBlind: 50, bigBlind: 100, startingStack: 10000, seatCount: 6,
      players: Array.from({ length: 6 }, (_, seat) => ({ id: `player-${seat}`, seat, name: `Player ${seat + 1}`, controller: "human", stack: 10000 })) },
    engineState: { fixture: true, deck: Array.from({ length: 52 }, (_, i) => ({ rank: i % 13 + 2, suit: i % 4 })) },
  });
  sql(`begin;
    insert into public.games (id, current_state, hand_number, status) values ('${id}', '${state}', ${hands}, 'playing');
    insert into public.game_players (game_id, seat, name, controller, stack, status, engine_player_id)
      select '${id}', n, 'Player ' || n, 'human', 10000, 'claimed', 'player-' || n from generate_series(0,5) n;
    insert into public.game_hosts values ('${id}', 'earlier');
    insert into public.game_listings (game_id, title) values ('${id}', 'earlier');
    insert into public.hands (game_id, hand_number, status, initial_state)
      select '${id}', n, 'playing', '{}' from generate_series(1,${hands}) n;
    insert into public.hand_card_reveals (game_id, hand_id, player_id, hand_number, engine_player_id, reason)
      select h.game_id, h.id, p.id, h.hand_number, p.engine_player_id, 'voluntary'
      from public.hands h join public.game_players p on p.game_id = h.game_id and p.seat = 0 where h.game_id = '${id}';
    commit;`);
}
function cleanup(id) {
  // Reveal/action foreign keys restrict player deletion: delete child rows first.
  sql(`begin; delete from public.hand_card_reveals where game_id = '${id}'; delete from public.games where id = '${id}'; commit;`);
}

async function concurrencyTest() {
  const id = randomUUID();
  fixture(id, 1);
  let writer;
  let completion;
  try {
    const check = (s) => {
      const later = s.game.version === 1;
      assert.equal(s.game.version, later ? 1 : 0);
      assert.equal(s.game.hand_number, later ? 2 : 1);
      assert.equal(s.host_token, later ? "later" : "earlier");
      assert.equal(s.listing.title, later ? "later" : "earlier");
      assert.equal(s.assignments[0].name, later ? "later" : "Player 0");
      assert.deepEqual(s.revealed_player_ids, later ? ["later-player"] : ["player-0"]);
      return later;
    };
    assert.equal(check((await snapshot(id)).data), false);
    // Hold a partially changed transaction open while another connection reads.
    writer = spawn("docker", sqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
    let error = "";
    writer.stderr.on("data", (data) => { error += data; });
    completion = new Promise((resolve, reject) => {
      writer.on("error", reject);
      writer.on("close", (code) => code === 0 ? resolve() : reject(new Error(error)));
    });
    // Attach a handler immediately, then propagate errors at the awaited boundary.
    completion.catch(() => {});
    const watchdog = setTimeout(() => writer.kill(), 30000);
    completion.finally(() => clearTimeout(watchdog)).catch(() => {});
    let signal = "";
    const changed = new Promise((resolve) => writer.stdout.on("data", (data) => {
      signal += data;
      if (signal.includes("partial-update")) resolve();
    }));
    writer.stdin.write(`begin; update public.games set version = 1, hand_number = 2 where id = '${id}'; select 'partial-update';\n`);
    await Promise.race([changed, completion.then(() => { throw new Error("Writer exited before signaling the update"); })]);
    for (let n = 0; n < 10; n++) assert.equal(check((await snapshot(id)).data), false);
    writer.stdin.end(`
      update public.game_hosts set host_token = 'later' where game_id = '${id}';
      update public.game_listings set title = 'later' where game_id = '${id}';
      update public.game_players set name = 'later' where game_id = '${id}' and seat = 0;
      insert into public.hands (game_id, hand_number, status, initial_state) values ('${id}', 2, 'playing', '{}');
      insert into public.hand_card_reveals (game_id, hand_id, player_id, hand_number, engine_player_id, reason)
        select h.game_id, h.id, p.id, 2, 'later-player', 'voluntary' from public.hands h
        join public.game_players p on p.game_id = h.game_id and p.seat = 0 where h.game_id = '${id}' and h.hand_number = 2;
      commit;\n`);
    for (let n = 0; n < 30; n++) check((await snapshot(id)).data);
    await completion;
    assert.equal(check((await snapshot(id)).data), true);
    console.log("Concurrent snapshots: earlier during uncommitted changes; coherent earlier/later across commit; later after commit.");
  } finally {
    // On assertion/read failure, release the writer's row lock before cleanup.
    if (writer?.stdin.writable) writer.stdin.end("rollback;\n");
    if (completion) await completion.catch(() => {});
    cleanup(id);
  }
}

async function oldRead(id) {
  // Exact pre-change host refresh shape: five sequential table reads, all historical reveals.
  const parts = [];
  for (const table of ["games", "game_players", "game_hosts", "game_listings", "hand_card_reveals"]) {
    parts.push(await request(`${table}?select=*&${table === "games" ? "id" : "game_id"}=eq.${id}`));
  }
  assert.equal(parts[4].data.length, parts[0].data[0].hand_number, "Benchmark must not truncate history");
  return parts.reduce((total, part) => total + part.bytes, 0);
}
function percentile(samples, p) { return samples[Math.ceil(samples.length * p) - 1]; }
async function benchmark() {
  const samples = Number(process.env.GAME_READ_SAMPLES ?? 100);
  assert(Number.isSafeInteger(samples) && samples >= 10 && samples <= 1000);
  const results = [];
  for (const hands of [10, 1000]) {
    const id = randomUUID();
    fixture(id, hands);
    try {
      sql(`analyze public.hand_card_reveals;`);
      const plan = sql(`explain (analyze, buffers) select engine_player_id from public.hand_card_reveals where game_id = '${id}' and hand_number = ${hands};`);
      console.log(`Reveal plan (${hands} hands):\n${plan}`);
      // Alternate order to reduce warm-up and drift bias. Both paths use the same fixture.
      const timings = { old: [], snapshot: [] };
      const bytes = { old: [], snapshot: [] };
      for (let n = 0; n < samples + 5; n++) {
        for (const path of n % 2 ? ["old", "snapshot"] : ["snapshot", "old"]) {
          const initialRequests = requestCount;
          const start = performance.now();
          const transferred = path === "old" ? await oldRead(id) : (await snapshot(id)).bytes;
          const duration = performance.now() - start;
          assert.equal(requestCount - initialRequests, path === "old" ? 5 : 1);
          if (n >= 5) { timings[path].push(duration); bytes[path].push(transferred); }
        }
      }
      for (const path of ["old", "snapshot"]) {
        timings[path].sort((a,b) => a-b);
        results.push({ hands, path, requests: path === "old" ? 5 : 1,
          responseBytes: Math.round(bytes[path].reduce((a,b) => a+b) / samples),
          medianMs: +percentile(timings[path], .5).toFixed(2), p95Ms: +percentile(timings[path], .95).toFixed(2), samples });
      }
    } finally { cleanup(id); }
  }
  console.table(results);
}

if (mode === "test") {
  console.log(sql(readFileSync(new URL("../test/sql/game-read-snapshot.sql", import.meta.url), "utf8")));
  await concurrencyTest();
} else {
  await benchmark();
}
