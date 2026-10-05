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
sql(readFileSync(new URL("../test/sql/bot-step-claims.sql", import.meta.url), "utf8"));
const id = randomUUID();
const acquire = token => `public.acquire_bot_step_claim('${id}',0,'bot','${token}')`;
const tokens = [randomUUID(), randomUUID()];
let locker;
let completion;
try {
  sql(`insert into public.games(id,status,current_state,hand_number) values('${id}','playing','{}',1);
    insert into public.game_players(game_id,seat,name,controller,stack,status,engine_player_id,bot_id,bot_label,bot_provider,ai_difficulty)
    values('${id}',0,'Claim Fixture','bot',1000,'bot','bot','rules','Rules','rules','medium');`);
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
    output += chunk; if (output.includes("locked")) resolve();
  }));
  locker.stdin.write(`begin; select id from public.games where id='${id}' for update; select 'locked';\n`);
  await Promise.race([locked, completion.then(() => { throw new Error("Locker exited before acquiring lock"); })]);
  const exec = promisify(execFile);
  const tag = `bot-claims-${id}`;
  const contenders = Promise.all(tokens.map(async token => {
    const { stdout } = await exec("docker", [...args, "-c", `set application_name='${tag}'; set role service_role; select ${acquire(token)};`], { encoding: "utf8", timeout: 30000 });
    return JSON.parse(stdout);
  }));
  contenders.catch(() => {});
  const deadline = Date.now() + 15000;
  while (Number(sql(`select count(*) from pg_stat_activity where application_name='${tag}' and wait_event_type='Lock';`)) !== 2) {
    assert(Date.now() < deadline, "Both contenders must wait on the game lock");
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  locker.stdin.end("commit;\n");
  await completion;
  const results = await contenders;
  assert.deepEqual(results.map(result => result.outcome).sort(), ["acquired", "busy"]);
  assert.equal(Number(sql(`select version from public.games where id='${id}';`)), 0);
  const winner = tokens[results.findIndex(result => result.outcome === "acquired")];
  const replacement = randomUUID();
  sql(`update public.bot_step_claims set expires_at=clock_timestamp()-interval '1 second' where game_id='${id}';`);
  assert.equal(JSON.parse(sql(`set role service_role; select ${acquire(replacement)};`)).outcome, "acquired");
  sql(`set role service_role; select public.release_bot_step_claim('${id}','${winner}');`);
  assert.equal(sql(`select claim_token from public.bot_step_claims where game_id='${id}';`).trim(), replacement);
  sql(`delete from public.games where id='${id}';`);
  assert.equal(Number(sql(`select count(*) from public.bot_step_claims where game_id='${id}';`)), 0);
  console.log("Bot claims: cross-connection contention, takeover, fencing, atomic commits and roles passed.");
} finally {
  if (locker && locker.exitCode === null) { locker.kill(); await completion?.catch(() => {}); }
  sql(`delete from public.games where id='${id}';`);
}
