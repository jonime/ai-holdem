/** Isolated local fixtures; no application .env, providers, resets or hosted credentials. */
import assert from "node:assert/strict";
import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes, randomUUID } from "node:crypto";
const args = ["exec", "-i", "supabase_db_ai-holdem", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
const sql = input => execFileSync("docker", args, { input, encoding: "utf8", timeout: 30000 }).trim();
const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
assert(["localhost", "127.0.0.1", "[::1]"].includes(new URL(status.API_URL).hostname), "Only local Supabase is allowed");
const owner = randomBytes(32).toString("hex");
const other = randomBytes(32).toString("hex");
const ip = randomBytes(32).toString("hex");
const ids = [randomUUID(), randomUUID()];
const tokens = [randomUUID(), randomUUID()];
const prefix = `usage-fixture:${randomUUID()}`;
const cleanupKeys = [owner, other, ip, ...ids, prefix];
const exec = promisify(execFile);
const parallel = queries => Promise.all(queries.map(async query => JSON.parse((await exec("docker", [...args, "-c", `set role service_role; ${query}`], { encoding: "utf8", timeout: 30000 })).stdout)));
const infer = (i, hash=owner) => `select public.admit_external_bot_call('${ids[i]}',0,'${tokens[i]}','${hash}',600,3600000,30,60000);`;
const create = (hash=owner) => `select public.admit_game_creation('${hash}','${ip}',6,30,600000);`;
const resetClaims = () => sql(`update public.bot_step_claims set usage_admitted=false,expires_at=clock_timestamp()+interval '90 seconds' where game_id in ('${ids.join("','")}');`);
try {
  for (let i=0;i<2;i++) sql(`insert into public.games(id,status,current_state,hand_number) values('${ids[i]}','playing','{}',1);
    insert into public.game_hosts(game_id,host_token) values('${ids[i]}','local-usage-owner');
    insert into public.bot_step_claims(game_id,expected_version,actor_engine_id,claim_token,expires_at) values('${ids[i]}',0,'bot','${tokens[i]}',clock_timestamp()+interval '90 seconds');`);
  // Seed near real default thresholds; concurrent distinct claims across games share owner.
  sql(`insert into public.usage_allowances values('inference:owner:${owner}',array_fill(clock_timestamp(),array[599]),clock_timestamp());`);
  const shared = await parallel([infer(0),infer(1)]);
  assert.equal(shared.filter(r=>r.outcome==='admitted').length,1);
  assert.equal(shared.find(r=>r.outcome==='denied').code,'OWNER_AI_LIMIT');
  assert.equal(Number(sql(`select cardinality(attempts) from public.usage_allowances where key='inference:owner:${owner}';`)),600);
  const winning = shared.findIndex(r=>r.outcome==='admitted');
  // Same claim admission remains idempotent even when both counters are full.
  const repeated = await parallel(Array.from({length:6},()=>infer(winning)));
  assert(repeated.every(r=>r.outcome==='admitted'));
  assert.equal(Number(sql(`select cardinality(attempts) from public.usage_allowances where key='inference:owner:${owner}';`)),600);
  resetClaims();
  // A different owner is independent, but the table's pacing remains independent of owner.
  assert.equal(JSON.parse(sql(`set role service_role; ${infer(1-winning,other)}`)).outcome,'admitted');
  resetClaims();
  sql(`update public.usage_allowances set attempts=array_fill(clock_timestamp(),array[30]) where key='inference:game:${ids[1-winning]}';`);
  assert.equal(JSON.parse(sql(`set role service_role; ${infer(1-winning,other)}`)).code,'GAME_AI_RATE_LIMIT');
  assert.equal(Number(sql(`select cardinality(attempts) from public.usage_allowances where key='inference:owner:${other}';`)),1);
  // Multiple reservations for one game serialize without overshooting pacing.
  sql(`update public.usage_allowances set attempts='{}' where key='inference:owner:${other}';
    update public.usage_allowances set attempts=array_fill(clock_timestamp(),array[28]) where key='inference:game:${ids[1-winning]}';`);
  const paced = await parallel(Array.from({length:6},()=>`select public.reserve_usage(array['inference:owner:${other}','inference:game:${ids[1-winning]}'],array[600,30],array[3600000,60000],array['OWNER_AI_LIMIT','GAME_AI_RATE_LIMIT']);`));
  assert.equal(paced.filter(r=>r.outcome==='admitted').length,2);
  assert.equal(Number(sql(`select cardinality(attempts) from public.usage_allowances where key='inference:game:${ids[1-winning]}';`)),30);
  // Exact open lower bound: an attempt at/older than window expiry no longer counts.
  sql(`update public.usage_allowances set attempts=array_fill(clock_timestamp()-interval '1 hour',array[600]) where key='inference:owner:${owner}';
    update public.usage_allowances set attempts=array_fill(clock_timestamp()-interval '1 minute',array[30]) where key='inference:game:${ids[1-winning]}';`);
  assert.equal(JSON.parse(sql(`set role service_role; ${infer(1-winning)}`)).outcome,'admitted');
  assert.equal(Number(sql(`select cardinality(attempts) from public.usage_allowances where key='inference:owner:${owner}';`)),1);
  // Invalid/expired claims and stale versions never reserve anything.
  sql(`update public.bot_step_claims set expires_at=clock_timestamp()-interval '1 second' where game_id='${ids[winning]}';`);
  assert.equal(JSON.parse(sql(`set role service_role; ${infer(winning)}`)).outcome,'claim_lost');
  assert.equal(JSON.parse(sql(`set role service_role; select public.admit_external_bot_call('${ids[winning]}',1,'${tokens[winning]}','${owner}',600,3600000,30,60000);`)).outcome,'conflict');
  assert.equal(Number(sql(`select version from public.games where id='${ids[winning]}';`)),0);
  // Concurrent creation admissions cannot overshoot either owner or IP.
  let results=await parallel(Array.from({length:10},()=>create()));
  assert.equal(results.filter(r=>r.outcome==='admitted').length,6);
  assert.equal(Number(sql(`select cardinality(attempts) from public.usage_allowances where key='creation:ip:${ip}';`)),6);
  sql(`update public.usage_allowances set attempts=array_fill(clock_timestamp(),array[29]) where key='creation:ip:${ip}';`);
  const replacementOwners=Array.from({length:4},()=>randomBytes(32).toString('hex'));
  cleanupKeys.push(...replacementOwners);
  results=await parallel(replacementOwners.map(hash=>create(hash)));
  assert.equal(results.filter(r=>r.outcome==='admitted').length,1);
  assert.equal(Number(sql(`select cardinality(attempts) from public.usage_allowances where key='creation:ip:${ip}';`)),30);
  sql(`update public.usage_allowances set attempts=array_fill(clock_timestamp()-interval '10 minutes',array[30]) where key='creation:ip:${ip}';
    update public.usage_allowances set attempts=array_fill(clock_timestamp()-interval '10 minutes',array[6]) where key='creation:owner:${owner}';`);
  assert.equal(JSON.parse(sql(`set role service_role; ${create()}`)).outcome,'admitted');
  // Bounded inactive cleanup; never seed or remove other users' data.
  sql(`insert into public.usage_allowances select '${prefix}:'||n,'{}',clock_timestamp()-interval '25 hours' from generate_series(1,105) n;`);
  sql(`set role service_role; ${create()}`);
  assert.equal(Number(sql(`select count(*) from public.usage_allowances where key like '${prefix}:%';`)),5);
  for (const role of ['anon','authenticated']) {
    assert.throws(()=>sql(`set role ${role}; ${create()}`));
    assert.throws(()=>sql(`set role ${role}; select * from public.usage_allowances;`));
  }
  console.log('Usage admission: concurrent owner/IP limits, claim idempotency, game pacing, expiry, independent owners, roles and bounded cleanup passed.');
} finally {
  sql(`delete from public.games where id in ('${ids.join("','")}');
    delete from public.usage_allowances where ${cleanupKeys.map(key=>`key like '%${key}%'`).join(' or ')};`);
}
