/** Local-only seat RPC checks. Never reads application .env or changes existing games. */
import assert from "node:assert/strict";
import { execFileSync, execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

const args = ["exec", "-i", "supabase_db_ai-holdem", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
const sql = input => execFileSync("docker", args, { input, encoding: "utf8", timeout: 30000 });
const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
assert(["localhost", "127.0.0.1", "::1"].includes(new URL(status.API_URL).hostname), "Only local Supabase is allowed");
const id = randomUUID();
const claim = (version, seat, token) => `public.claim_game_seat_if_version('${id}',${version},${seat},'${token}',null)`;
const release = (version, seat, token) => `public.release_game_seat_if_version('${id}',${version},${seat},'${token}')`;
const assign = (version, seat, token) => `public.assign_bot_to_seat_if_version('${id}',${version},${seat},'${token}','Rules #1','rules','Rules','rules',null,'medium',null)`;
const call = expression => JSON.parse(sql(`set role service_role; select ${expression};`));
function expectOutcome(expression, outcome) { const result = call(expression); assert.equal(result.outcome, outcome); return result; }
const readVersion = () => Number(sql(`select version from public.games where id='${id}';`));
const rows = () => JSON.parse(sql(`select jsonb_agg(to_jsonb(p) order by seat) from public.game_players p where game_id='${id}';`));
let locker;
let completion;
try {
  sql(`begin;
    insert into public.games(id,current_state,hand_number,status) values('${id}','{}',0,'waiting');
    insert into public.game_players(game_id,seat,name,controller,stack,status)
      select '${id}',n,'Seat '||(n+1),'human',10000,'open' from generate_series(0,5) n;
    insert into public.game_hosts(game_id,host_token) values('${id}','host');
    commit;`);
  // Hold the game row in a separate connection until both claims are waiting on locks.
  locker = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  locker.stderr.on("data", chunk => { stderr += chunk; });
  completion = new Promise((resolve, reject) => {
    locker.on("error", reject);
    locker.on("close", code => code === 0 ? resolve() : reject(new Error(stderr)));
  });
  completion.catch(() => {});
  const watchdog = setTimeout(() => locker.kill(), 30000);
  completion.finally(() => clearTimeout(watchdog)).catch(() => {});
  let output = "";
  const locked = new Promise(resolve => locker.stdout.on("data", chunk => {
    output += chunk;
    if (output.includes("locked")) resolve();
  }));
  locker.stdin.write(`begin; select id from public.games where id='${id}' for update; select 'locked';\n`);
  await Promise.race([locked, completion.then(() => { throw new Error("Locker exited before acquiring lock"); })]);
  const exec = promisify(execFile);
  const tag = `seats-${id}`;
  const contender = async token => {
    // Each docker exec opens an independent PostgreSQL connection.
    const expression = `set application_name='${tag}'; set role service_role; select ${claim(0, 0, token)};`;
    const { stdout } = await exec("docker", [...args, "-c", expression], { encoding: "utf8", timeout: 30000 });
    return JSON.parse(stdout);
  };
  const contenders = Promise.all([contender("alice"), contender("bob")]);
  contenders.catch(() => {});
  const deadline = Date.now() + 15000;
  while (Number(sql(`select count(*) from pg_stat_activity where application_name='${tag}' and wait_event_type='Lock';`)) !== 2) {
    assert(Date.now() < deadline, "Both claims must block on the game row lock");
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  locker.stdin.end("commit;\n");
  await completion;
  const results = await contenders;
  assert.deepEqual(results.map(result => result.outcome).sort(), ["conflict", "ok"]);
  assert.equal(readVersion(), 1);
  const owner = rows()[0].player_token;
  const identity = rows()[0].engine_player_id;
  const retry = expectOutcome(claim(0, 0, owner), "ok");
  assert.equal(retry.version, 1);
  assert.equal(readVersion(), 1);
  expectOutcome(claim(0, 1, "new-player"), "conflict");
  expectOutcome(claim(1, 0, "new-player"), "unavailable");
  expectOutcome(claim(1, 99, "new-player"), "missing");
  const moved = expectOutcome(claim(1, 1, owner), "ok");
  assert.equal(moved.version, 2);
  assert.equal(moved.seat.engine_player_id, identity);
  assert.equal(rows()[0].status, "open");
  assert.equal(rows()[0].player_token, null);
  assert.equal(rows()[0].engine_player_id, null);
  assert.equal(rows().filter(row => row.player_token === owner).length, 1);
  expectOutcome(assign(2, 2, "intruder"), "forbidden");
  expectOutcome(release(2, 1, "intruder"), "forbidden");
  assert.equal(readVersion(), 2);
  // Durable host is unseated and can assign and release bots.
  const bot = expectOutcome(assign(2, 2, "host"), "ok");
  assert.equal(bot.seat.status, "bot");
  expectOutcome(assign(2, 3, "host"), "conflict");
  const cleared = expectOutcome(release(3, 2, "host"), "ok");
  assert.equal(cleared.seat.status, "open");
  assert.equal(cleared.seat.bot_id, null);
  assert.equal(cleared.seat.leaving, false);
  const selfCleared = expectOutcome(release(4, 1, owner), "ok");
  assert.equal(selfCleared.seat.player_token, null);
  assert.equal(selfCleared.seat.engine_player_id, null);
  expectOutcome(claim(5, 1, owner), "ok");
  const retainedIdentity = rows()[1].engine_player_id;
  for (const gameStatus of ["playing", "complete", "error"]) {
    sql(`update public.games set status='${gameStatus}' where id='${id}';`);
    const version = readVersion();
    const leaving = expectOutcome(release(version, 1, owner), "ok");
    assert.equal(leaving.seat.status, "claimed");
    assert.equal(leaving.seat.player_token, owner);
    assert.equal(leaving.seat.leaving, true);
    assert.equal(leaving.seat.engine_player_id, retainedIdentity);
    assert.equal(leaving.version, version + 1);
    expectOutcome(release(version, 1, "host"), "conflict");
  }
  sql(`delete from public.game_hosts where game_id='${id}'; update public.game_players set is_host=true where game_id='${id}' and seat=1;`);
  expectOutcome(assign(readVersion(), 3, owner), "forbidden");
  expectOutcome(release(readVersion(), 0, owner), "forbidden");
  // RPCs are inaccessible to anonymous and authenticated roles.
  for (const role of ["anon", "authenticated"]) {
    assert.equal(sql(`select has_function_privilege('${role}','public.claim_game_seat_if_version(uuid,bigint,integer,text,text)','execute');`).trim(), "f");
    assert.equal(sql(`select has_function_privilege('${role}','public.assign_bot_to_seat_if_version(uuid,bigint,integer,text,text,text,text,text,text,text,text)','execute');`).trim(), "f");
    assert.equal(sql(`select has_function_privilege('${role}','public.release_game_seat_if_version(uuid,bigint,integer,text)','execute');`).trim(), "f");
  }
  console.log("Seat SQL checks passed: row-lock contention, versions, idempotence, atomic moves, authorization, unseated hosts, and release states.");
} finally {
  if (locker?.stdin.writable) locker.stdin.end("rollback;\n");
  if (completion) await completion.catch(() => {});
  sql(`delete from public.games where id='${id}';`);
}
