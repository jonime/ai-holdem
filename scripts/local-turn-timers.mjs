/** Local-only claim checks; no application .env, DB resets or external providers. */
import assert from "node:assert/strict";
import { execFileSync, execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";

const args = ["exec", "-i", "supabase_db_ai-holdem", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
const sql = input => execFileSync("docker", args, { input, encoding: "utf8", timeout: 30000 });
const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
assert(["localhost", "127.0.0.1", "::1"].includes(new URL(status.API_URL).hostname), "Only local Supabase is allowed");
sql(readFileSync(new URL("../test/sql/human-turn-timers.sql", import.meta.url), "utf8"));

for (const manual of [false, true]) {
  const id = randomUUID(); const tag = `turn-timers-${id}`; let locker; let completion;
  const state = { config: { humanTurnSeconds: 30 }, engineState: { revision: 1 } };
  const next = { ...state, engineState: { revision: 2 } };
  const argsFor = decision => ({ p_operation: "apply_human_action_if_version", p_arguments: {
    p_game_id: id, p_expected_version: 0, p_player_engine_id: "a", p_current_state: next,
    p_status: "playing", p_hand_number: 1, p_state_schema_version: 1, p_street: "preflop", p_action: "check", p_amount: null,
    p_state_before: state, p_state_after: next, p_hand_complete: false },
    p_transition: { handNumber: 1, multiplayer: true, actorEngineId: "b" }, p_decision_id: decision, p_driver_token: "host" });
  const literal = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
  const expression = args => `select public.commit_with_turn_timer('${args.p_operation}',${literal(args.p_arguments)},${literal(args.p_transition)},${args.p_decision_id ? `'${args.p_decision_id}'` : 'null'},'host');`;
  try {
    const decision = randomUUID();
    sql(`insert into public.games(id,status,current_state,hand_number,human_timer_hand,human_timer_enabled,turn_decision_id,turn_actor_engine_id,turn_hand_number,turn_deadline)
      values('${id}','playing',${literal(state)},1,1,true,'${decision}','a',1,clock_timestamp()-interval '1 second');
      insert into public.game_hosts(game_id,host_token) values('${id}','host');
      insert into public.game_players(game_id,seat,name,controller,stack,status,engine_player_id,player_token)
        values('${id}',0,'A','human',1000,'claimed','a','a-owner'),('${id}',1,'B','human',1000,'claimed','b','b-owner');
      insert into public.hands(game_id,hand_number,status,initial_state) values('${id}',1,'playing',${literal(state)});`);
    locker = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = ""; locker.stderr.on("data", chunk => { stderr += chunk; });
    completion = new Promise((resolve,reject) => { locker.on("error",reject); locker.on("close",code => code===0 ? resolve() : reject(new Error(stderr))); });
    completion.catch(() => {});
    const watchdog = setTimeout(() => locker.kill(),30000);
    completion.finally(() => clearTimeout(watchdog)).catch(() => {});
    let output = "";
    const locked = new Promise(resolve => locker.stdout.on("data",chunk => { output += chunk; if(output.includes("locked")) resolve(); }));
    locker.stdin.write(`begin; select id from public.games where id='${id}' for update; select 'locked';\n`);
    await Promise.race([locked,completion.then(() => { throw new Error("Locker exited early"); })]);
    const exec = promisify(execFile);
    const contenders = Promise.all([decision,manual ? null : decision].map(async token => {
      const { stdout } = await exec("docker",[...args,"-c",`set application_name='${tag}'; set role service_role; ${expression(argsFor(token))}`],{encoding:"utf8",timeout:30000});
      return JSON.parse(stdout);
    })); contenders.catch(() => {});
    const waitUntil = Date.now()+15000;
    while(Number(sql(`select count(*) from pg_stat_activity where application_name='${tag}' and wait_event_type='Lock';`))!==2) {
      assert(Date.now()<waitUntil,"Both contenders must block on the game lock"); await new Promise(resolve => setTimeout(resolve,50));
    }
    locker.stdin.end("commit;\n"); await completion;
    const results = await contenders;
    assert.equal(results.filter(result => Array.isArray(result) && result.length===1).length,1);
    assert.equal(Number(sql(`select version from public.games where id='${id}';`)),1);
    assert.equal(Number(sql(`select count(*) from public.actions where game_id='${id}';`)),1);
    assert.equal(Number(sql(`select count(*) from public.game_players where game_id='${id}' and status='claimed';`)),2);
  } finally {
    if(locker && locker.exitCode===null) { locker.kill(); await completion?.catch(() => {}); }
    sql(`delete from public.games where id='${id}';`);
  }
}
console.log("Turn timers: deadlines, legacy fences, authorization, history, seats and cross-connection races passed.");
