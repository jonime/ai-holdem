/** Rollback-only departure checks; no application environment or provider access. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
assert(["localhost", "127.0.0.1", "::1"].includes(new URL(status.API_URL).hostname), "Only local Supabase is allowed");
execFileSync("docker", ["exec", "-i", "supabase_db_ai-holdem", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"], {
  input: readFileSync(new URL("../test/sql/human-departures.sql", import.meta.url), "utf8"), encoding: "utf8", timeout: 30000,
});
console.log("Human departures: registration, folds, cleanup, history, ownership, rollback and roles passed.");

// Independent PostgreSQL connections must contend on the game row. Each round
// uses a disposable committed fixture, then deletes only that fixture in finally.
const { execFile, spawn } = await import("node:child_process");
const { randomUUID } = await import("node:crypto");
const { promisify } = await import("node:util");
const exec = promisify(execFile);
const args = ["exec", "-i", "supabase_db_ai-holdem", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
const sql = input => execFileSync("docker", args, { input, encoding: "utf8", timeout: 30000 });
const literal = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
for (const mode of ["departures", "human-action", "bot-commit", "advance"]) {
  const id = randomUUID(); const claimToken = randomUUID(); const tag = `departures-${id}`;
  const state = { stateSchemaVersion: 1, config: { players: [] }, engineState: { hand: {
    currentActorSeat: 0, players: [{ playerId: "a", seat: 0 }, { playerId: "b", seat: 1 }] } } };
  const fold = { playerEngineId: "a", action: "fold", amount: null, handNumber: 1,
    stateSchemaVersion: 1, street: "preflop", status: "playing", handComplete: false,
    stateBefore: state, currentState: { ...state, engineState: { hand: { ...state.engineState.hand, currentActorSeat: 1 } } } };
  const humanAction = `select count(*) from public.apply_human_action_if_version('${id}',0,'a',${literal(fold.currentState)},'playing',1,1,'preflop','check',null,${literal(state)},${literal(fold.currentState)},false);`;
  const release = seat => `select public.depart_game_seat_if_version('${id}',0,${seat},'owner${seat}',${seat === 0 ? literal(fold) : 'null'})->>'outcome';`;
  const botCommit = `select count(*) from public.commit_bot_action_with_claim('${claimToken}',
    '${id}',0,'a',${literal(fold.currentState)},'playing',1,1,'preflop','check',null,${literal(state)},${literal(fold.currentState)},false,
    '{}','[]','check','rules','Rules','rules',null,null,null,null,null,null,null,null,null,null,null);`;
  let locker; let completion;
  try {
    sql(`begin;
      insert into public.games(id,status,current_state,hand_number) values('${id}','playing',${literal(state)},1);
      insert into public.game_hosts(game_id,host_token) values('${id}','owner0');
      insert into public.game_players(game_id,seat,name,controller,stack,status,engine_player_id,player_token,leaving,bot_id,bot_label,bot_provider,ai_difficulty)
        values('${id}',0,'Race A','${mode === 'bot-commit' ? 'bot' : 'human'}',1000,'${mode === 'bot-commit' ? 'bot' : 'claimed'}','a',${mode === 'bot-commit' ? 'null' : "'owner0'"},${mode === 'advance'},${mode === 'bot-commit' ? "'rules','Rules','rules','medium'" : 'null,null,null,null'}),
          ('${id}',1,'Race B','human',1000,'claimed','b','owner1',false,null,null,null,null);
      insert into public.hands(game_id,hand_number,status,initial_state) values('${id}',1,'playing',${literal(state)});
      ${mode === 'bot-commit' ? `select public.acquire_bot_step_claim('${id}',0,'a','${claimToken}');` : ''}
      commit;`);
    locker = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = ""; locker.stderr.on("data", chunk => { stderr += chunk; });
    completion = new Promise((resolve, reject) => { locker.on("error", reject);
      locker.on("close", code => code === 0 ? resolve() : reject(new Error(stderr))); });
    completion.catch(() => {});
    const watchdog = setTimeout(() => locker.kill(), 30000);
    completion.finally(() => clearTimeout(watchdog)).catch(() => {});
    let output = "";
    const locked = new Promise(resolve => locker.stdout.on("data", chunk => { output += chunk;
      if (output.includes("locked")) resolve(); }));
    locker.stdin.write(`begin; select id from public.games where id='${id}' for update; select 'locked';\n`);
    await Promise.race([locked, completion.then(() => { throw new Error("Locker exited early"); })]);
    const first = mode === "advance" ? `select count(*) from public.advance_departure_if_version('${id}',0,'owner1',${literal(fold)});` : mode === "bot-commit" ? release(1) : release(0);
    const second = mode === "human-action" ? humanAction : mode === "bot-commit" ? botCommit : mode === "advance" ? first : release(1);
    const contenders = Promise.all([first, second].map(async expression => {
      const { stdout } = await exec("docker", [...args, "-c", `set application_name='${tag}'; set role service_role; ${expression}`], { encoding: "utf8", timeout: 30000 });
      return stdout.trim();
    }));
    contenders.catch(() => {});
    const deadline = Date.now() + 15000;
    while (Number(sql(`select count(*) from pg_stat_activity where application_name='${tag}' and wait_event_type='Lock';`)) !== 2) {
      assert(Date.now() < deadline, "Both departure contenders must block on the game row");
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    locker.stdin.end("commit;\n"); await completion;
    const results = await contenders;
    assert.equal(Number(sql(`select version from public.games where id='${id}';`)), 1);
    assert.equal(results.filter(value => value === "ok" || value === "1").length, 1, `${mode}: exactly one commit`);
    const actionCount = Number(sql(`select count(*) from public.actions where game_id='${id}';`));
    assert(actionCount <= 1, `${mode}: at most one history action`);
    if (mode === "advance") assert.equal(actionCount, 1);
    console.log(`Human departure race passed: ${mode}.`);
  } finally {
    if (locker && locker.exitCode === null) locker.stdin.end("rollback;\n");
    await completion?.catch(() => {});
    sql(`delete from public.games where id='${id}';`);
  }
}
