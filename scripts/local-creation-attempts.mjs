/** Local isolated fixtures, no .env, inference, resets, or hosted credentials. */
import assert from "node:assert/strict";
import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes, randomUUID } from "node:crypto";
const args = ["exec", "-i", "supabase_db_ai-holdem", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
const sql = input => execFileSync("docker", args, { input, encoding: "utf8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"] }).trim();
const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
assert(["localhost", "127.0.0.1", "[::1]"].includes(new URL(status.API_URL).hostname), "Only local Supabase is allowed");
const owner = randomBytes(32).toString("hex"), other = randomBytes(32).toString("hex"), ip = randomBytes(32).toString("hex"), fingerprint = randomBytes(32).toString("hex");
const id = randomUUID(), failed = randomUUID(), denied = randomUUID();
const exec = promisify(execFile);
const input = { p_current_state: {}, p_state_schema_version: 1, p_hand_number: 0, p_status: "waiting", p_host_token: randomUUID(), p_players: [0,1].map(seat => ({ seat, name: `Seat ${seat + 1}`, controller: "human", status: "open", stack: 10000 })) };
const call = (who=owner, attempt=id, fp=fingerprint, body=input, allowance=6) => `select public.create_game_with_attempt('${who}','${attempt}','${fp}','${who}','${ip}',${allowance},30,600000,'${JSON.stringify(body)}'::jsonb);`;
const read = query => JSON.parse(sql(`set role service_role; ${query}`));
try {
  const queries = Array.from({ length: 6 }, () => call());
  const results = await Promise.all(queries.map(async query => JSON.parse((await exec("docker", [...args,"-c",`set role service_role; ${query}`], { encoding: "utf8", timeout: 30000 })).stdout)));
  assert(results.every(r => r.outcome === "created"));
  assert.equal(new Set(results.map(r => r.games[0].id)).size,1);
  assert.equal(sql(`select cardinality(attempts) from public.usage_allowances where key='creation:owner:${owner}';`),'1');
  assert.equal(sql(`select cardinality(attempts) from public.usage_allowances where key='creation:ip:${ip}';`),'1');
  assert.equal(read(call(owner,id,other)).outcome,'conflict');
  const separate = read(call(other)); assert.notEqual(separate.games[0].id,results[0].games[0].id);
  // A failed writer must roll back its allowance and leave no attempt record.
  assert.throws(() => read(call(owner,failed,fingerprint,{ ...input,p_status:'invalid' })));
  assert.equal(sql(`select count(*) from public.creation_attempts where attempt_id='${failed}';`),'0');
  assert.equal(sql(`select cardinality(attempts) from public.usage_allowances where key='creation:owner:${owner}';`),'1');
  assert.equal(read(call(owner,denied,fingerprint,input,1)).outcome,'denied');
  assert.equal(sql(`select count(*) from public.creation_attempts where attempt_id='${denied}';`),'0');
  // Matching retry still succeeds with exhausted allowance and different IP allowance inputs.
  assert.equal(read(call(owner,id,fingerprint,input,1)).games[0].id,results[0].games[0].id);
  sql(`delete from public.games where id='${results[0].games[0].id}';`);
  assert.equal(read(call()).outcome,'unavailable');
  assert.equal(sql(`select count(*) from public.creation_attempts where owner_hash='${owner}' and game_id is null;`),'1');
  for (const role of ['anon','authenticated']) {
    assert.throws(() => sql(`set role ${role}; select * from public.creation_attempts;`));
    assert.throws(() => sql(`set role ${role}; ${call()}`));
  }
  console.log('Creation attempts: concurrent replay, charge once, conflicts, rollback, denial, owner isolation, tombstones and restricted roles passed.');
} finally {
  sql(`delete from public.games where id in (select game_id from public.creation_attempts where owner_hash in ('${owner}','${other}'));
    delete from public.creation_attempts where owner_hash in ('${owner}','${other}');
    delete from public.usage_allowances where key in ('creation:owner:${owner}','creation:owner:${other}','creation:ip:${ip}');`);
}
