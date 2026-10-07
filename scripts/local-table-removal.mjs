/** Rollback-only local SQL checks; no application environment or provider access. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
assert(["localhost", "127.0.0.1", "::1"].includes(new URL(status.API_URL).hostname), "Only local Supabase is allowed");
execFileSync("docker", ["exec", "-i", "supabase_db_ai-holdem", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"], {
  input: readFileSync(new URL("../test/sql/table-removal.sql", import.meta.url), "utf8"), encoding: "utf8", timeout: 30000,
});
console.log("Table removal: ownership, blockers, history cleanup, rollback, exclusions, restoration and roles passed.");

// Independent connections prove removal shares the claim/action game-row lock.
const { execFile, spawn } = await import("node:child_process");
const { randomUUID } = await import("node:crypto");
const { promisify } = await import("node:util");
const exec = promisify(execFile);
const args = ["exec", "-i", "supabase_db_ai-holdem", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
const sql = input => execFileSync("docker", args, { input, encoding: "utf8", timeout: 30000 });
const literal = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
for (const mode of ["claim", "action"]) {
  const id = randomUUID(); const tag = `removal-${id}`;
  const state = { stateSchemaVersion: 1, config: { players: [] }, engineState: { hand: { currentActorSeat: 0, players: [{ playerId: "a", seat: 0 }, { playerId: "b", seat: 1 }] } } };
  let locker; let completion;
  try {
    sql(`begin;
      insert into public.games(id,status,current_state,hand_number) values('${id}','${mode === "claim" ? "waiting" : "playing"}',${literal(state)},1);
      insert into public.game_hosts(game_id,host_token) values('${id}','host');
      insert into public.game_players(game_id,seat,name,controller,stack,status,engine_player_id,player_token) values
        ('${id}',0,'Host','human',1000,'claimed','a','host'),('${id}',1,'Open','human',1000,'open',null,null);
      insert into public.hands(game_id,hand_number,status,initial_state) values('${id}',1,'playing',${literal(state)});
      commit;`);
    locker = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = ""; locker.stderr.on("data", chunk => { stderr += chunk; });
    completion = new Promise((resolve, reject) => { locker.on("error", reject); locker.on("close", code => code === 0 ? resolve() : reject(new Error(stderr))); });
    completion.catch(() => {});
    const watchdog = setTimeout(() => locker.kill(), 30000);
    completion.finally(() => clearTimeout(watchdog)).catch(() => {});
    let output = "";
    const locked = new Promise(resolve => locker.stdout.on("data", chunk => { output += chunk; if (output.includes("locked")) resolve(); }));
    locker.stdin.write(`begin; select id from public.games where id='${id}' for update; select 'locked';\n`);
    await Promise.race([locked, completion.then(() => { throw new Error("Locker exited early"); })]);
    const removal = `select public.remove_game_if_version('${id}',0,'host','delete')->>'outcome';`;
    const competing = mode === "claim"
      ? `select public.claim_game_seat_if_version('${id}',0,1,'guest',null)->>'outcome';`
      : `select count(*) from public.apply_human_action_if_version('${id}',0,'a',${literal(state)},'playing',1,1,'preflop','check',null,${literal(state)},${literal(state)},false);`;
    const contenders = Promise.all([removal, competing].map(async expression => {
      const { stdout } = await exec("docker", [...args, "-c", `set application_name='${tag}'; set role service_role; ${expression}`], { encoding: "utf8", timeout: 30000 });
      return stdout.trim();
    }));
    contenders.catch(() => {});
    const deadline = Date.now() + 15000;
    while (Number(sql(`select count(*) from pg_stat_activity where application_name='${tag}' and wait_event_type='Lock';`)) !== 2) {
      assert(Date.now() < deadline, "Both removal contenders must block on the game row");
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    locker.stdin.end("commit;\n"); await completion;
    const results = await contenders;
    assert.equal(results.filter(value => value === "ok" || value === "1").length, 1, `${mode}: exactly one commit`);
    assert.equal(Number(sql(`select coalesce((select version from public.games where id='${id}'),-1);`)), results[0] === "ok" ? -1 : 1);
    if (mode === "claim" && results[1] === "ok") assert.equal(sql(`select public.remove_game_if_version('${id}',1,'host','delete')->>'outcome';`).trim(), "blocked");
    console.log(`Table removal race passed: ${mode}.`);
  } finally {
    if (locker && locker.exitCode === null) locker.stdin.end("rollback;\n");
    await completion?.catch(() => {});
    sql(`begin; delete from public.actions where game_id='${id}'; delete from public.games where id='${id}'; commit;`);
  }
}
