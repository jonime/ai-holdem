/** Fixture-owned local SQL lifecycle tests; no app environment, resets or provider access. */
import assert from "node:assert/strict";
import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID, randomBytes } from "node:crypto";
const args = ["exec", "-i", "supabase_db_ai-holdem", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
const sql = input => execFileSync("docker", args, { input, encoding: "utf8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"] }).trim();
const parallelSQL = async input => {
  const child = promisify(execFile)("docker", args.slice(0, 1).concat(args.slice(2), ["-c", input]), { encoding: "utf8", timeout: 30000 });
  return (await child).stdout.trim();
};
const id = randomUUID();
const hash = randomBytes(32).toString("hex"), ip = randomBytes(32).toString("hex");
const token = () => randomBytes(32).toString("hex");
const first = token(), second = token(), third = token();
const call = (operation, link, owner = "historical-owner", snapshot = '{"schemaVersion":1,"replay":{"marker":"fixed"}}', history = `public.get_hand_replay('${id}',1)`) =>
  `select public.manage_replay_share('${id}',1,'${owner}','${operation}','${link}','${snapshot}',${history},'${hash}','${ip}',2,10,3600000);`;
try {
  sql(`insert into public.games(id,current_state) values('${id}','{}');
    insert into public.hands(game_id,hand_number,status,initial_state,final_state,completed_at)
    values('${id}',1,'complete','{"config":{"players":[{"id":"old-id","controller":"human","playerToken":"historical-owner"}]}}','{}',now());`);
  for (const role of ["anon", "authenticated"]) {
    assert.equal(sql(`select has_table_privilege('${role}','public.replay_shares','select');`), "f");
    assert.equal(sql(`select has_function_privilege('${role}','public.read_replay_share(text)','execute');`), "f");
    assert.throws(() => sql(`set role ${role}; ${call("read", "")}`));
  }
  assert.equal(JSON.parse(sql(call("create", first, "replacement-seat-owner"))).outcome,"forbidden");
  assert.equal(JSON.parse(sql(call("create", first, "historical-owner", undefined, "'{}'::jsonb"))).outcome,"conflict");
  sql(`update public.hands set status='playing', final_state=null, completed_at=null where game_id='${id}';`);
  assert.equal(JSON.parse(sql(call("create", first))).outcome,"forbidden");
  sql(`update public.hands set status='complete', final_state='{}', completed_at=now() where game_id='${id}';`);
  const created = JSON.parse(sql(`set role service_role; ${call("create", first)}`));
  assert.equal(created.share.token,first);
  assert.equal(sql(`select (expires_at-created_at)=interval '30 days' from public.replay_shares where game_id='${id}';`),"t");
  const duplicate = JSON.parse(sql(call("create", second, "historical-owner", '{"schemaVersion":1,"replay":{"marker":"later-show"}}')));
  assert.deepEqual(duplicate,created);
  assert.deepEqual(JSON.parse(sql(`select public.read_replay_share('${first}');`)),{schemaVersion:1,replay:{marker:"fixed"}});
  assert.equal(sql(`select coalesce(public.read_replay_share('${token()}')::text,'null');`),"null");
  assert.equal(sql(`select cardinality(attempts) from public.usage_allowances where key='share:owner:${hash}';`),"1");
  assert.equal(sql(`select count(*) from public.usage_allowances where key in ('creation:owner:${hash}','inference:owner:${hash}');`),"0");
  // Revoke twice; possession of the viewing token cannot manage the link.
  assert.equal(JSON.parse(sql(call("revoke", "", first))).outcome,"forbidden");
  sql(call("revoke", "")); sql(call("revoke", ""));
  assert.equal(sql(`select coalesce(public.read_replay_share('${first}')::text,'null');`),"null");
  const concurrent = await Promise.all([parallelSQL(call("create", second)),parallelSQL(call("create", third))]);
  assert.deepEqual(JSON.parse(concurrent[0]),JSON.parse(concurrent[1]));
  const active = JSON.parse(concurrent[0]).share.token;
  assert.notEqual(active,first);
  assert.equal(sql(`select count(*) from public.replay_shares where game_id='${id}' and revoked_at is null;`),"1");
  sql(`update public.replay_shares set expires_at=clock_timestamp()-interval '1 second' where game_id='${id}' and revoked_at is null;`);
  assert.equal(sql(`select coalesce(public.read_replay_share('${active}')::text,'null');`),"null");
  assert.deepEqual(JSON.parse(sql(call("read", ""))),{share:null});
  assert.equal(JSON.parse(sql(call("create", token()))).outcome,"denied");
  assert.equal(sql(`select count(*) from public.replay_shares where game_id='${id}';`),"2");
  sql(`update public.usage_allowances set attempts='{}' where key='share:owner:${hash}';`);
  const renewed = JSON.parse(sql(call("create", token())));
  assert.notEqual(renewed.share.token,active);
  assert.equal(sql(`select coalesce(public.read_replay_share('${active}')::text,'null');`),"null");
  sql(`delete from public.games where id='${id}';`);
  assert.equal(sql(`select count(*) from public.replay_shares where game_id='${id}';`),"0");
  assert.equal(sql(`select coalesce(public.read_replay_share('${first}')::text,'null');`),"null");
  console.log("Share SQL: roles, historical ownership, history recheck, concurrency, fixed expiry/snapshot, separate admission, revocation, expiration and cascade passed.");
} finally {
  sql(`delete from public.games where id='${id}'; delete from public.usage_allowances where key in ('share:owner:${hash}','share:ip:${ip}');`);
}
