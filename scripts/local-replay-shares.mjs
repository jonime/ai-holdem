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
const pagePrefix = token().slice(0,48);
const call = (operation, link, owner = "historical-owner", snapshot = '{"schemaVersion":1,"replay":{"marker":"fixed"}}', history = `public.get_hand_replay('${id}',1)`) =>
  `select public.manage_replay_share_with_title('${id}',1,'${owner}','${operation}','${link}','${snapshot}',${history},'${hash}','${ip}',2,10,3600000);`;
try {
  sql(`insert into public.games(id,current_state) values('${id}','{}');
    insert into public.hands(game_id,hand_number,status,initial_state,final_state,completed_at)
    values('${id}',1,'complete','{"config":{"players":[{"id":"old-id","controller":"human","playerToken":"historical-owner"}]}}','{}',now());`);
  for (const role of ["anon", "authenticated"]) {
    assert.equal(sql(`select has_table_privilege('${role}','public.replay_shares','select');`), "f");
    assert.equal(sql(`select has_function_privilege('${role}','public.read_replay_share_with_title(text)','execute');`), "f");
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
  // Legacy readers and creators keep their exact pre-title DTOs during rollout.
  const legacy = JSON.parse(sql(call("read", "").replace("manage_replay_share_with_title", "manage_replay_share")));
  assert.deepEqual(Object.keys(legacy.share).sort(),["expiresAt","token"]);
  assert.deepEqual(JSON.parse(sql(`select public.read_replay_share('${first}');`)),{schemaVersion:1,replay:{marker:"fixed"}});
  assert.deepEqual(Object.keys(JSON.parse(sql(`select public.list_replay_shares('historical-owner');`)).shares[0]).sort(),["createdAt","expiresAt","handNumber","token"]);
  const duplicate = JSON.parse(sql(call("create", second, "historical-owner", '{"schemaVersion":1,"replay":{"marker":"later-show"}}')));
  assert.deepEqual(duplicate.share,created.share);
  assert.equal(created.generationEligible,true); assert.equal(duplicate.generationEligible,false);
  assert.deepEqual(JSON.parse(sql(`select public.read_replay_share_with_title('${first}');`)),{schemaVersion:1,replay:{marker:"fixed"},title:null});
  assert.equal(sql(`select coalesce(public.read_replay_share_with_title('${token()}')::text,'null');`),"null");
  assert.equal(sql(`select cardinality(attempts) from public.usage_allowances where key='share:owner:${hash}';`),"1");
  assert.equal(sql(`select count(*) from public.usage_allowances where key in ('creation:owner:${hash}','inference:owner:${hash}');`),"0");
  // Generated writes lose to manual edits, including a manual clear; revisions fence stale tabs.
  const edit = (link, revision, title, owner = "historical-owner") => `select public.edit_replay_share_title('${link}','${owner}',${revision},${title === null ? 'null' : "'"+title+"'"});`;
  const generated = link => `select public.commit_replay_share_title('${link}','A factual title');`;
  for (const role of ["anon", "authenticated"]) {
    assert.throws(() => sql(`set role ${role}; ${edit(first,0,"Changed")}`));
    assert.throws(() => sql(`set role ${role}; ${generated(first)}`));
  }
  assert.equal(JSON.parse(sql(edit(first,0,"Changed","intruder"))).outcome,"forbidden");
  const edits = await Promise.all([parallelSQL(edit(first,0,"First edit")),parallelSQL(edit(first,0,"Second edit"))]);
  assert.equal(edits.map(JSON.parse).filter(r=>r.outcome==="conflict").length,1);
  assert.equal(sql(generated(first)),"f");
  assert.equal(JSON.parse(sql(edit(first,1,null))).titleRevision,2);
  assert.equal(sql(generated(first)),"f");
  assert.equal(JSON.parse(sql(`select public.read_replay_share_with_title('${first}');`)).title,null);
  // Revoke twice; possession of the viewing token cannot manage the link.
  assert.equal(JSON.parse(sql(call("revoke", "", first))).outcome,"forbidden");
  sql(call("revoke", "")); sql(call("revoke", ""));
  assert.equal(sql(`select coalesce(public.read_replay_share_with_title('${first}')::text,'null');`),"null");
  assert.equal(sql(generated(first)),"f");
  assert.equal(JSON.parse(sql(edit(first,2,"Late"))).outcome,"forbidden");
  const concurrent = await Promise.all([parallelSQL(call("create", second)),parallelSQL(call("create", third))]);
  assert.deepEqual(JSON.parse(concurrent[0]).share,JSON.parse(concurrent[1]).share);
  assert.equal(concurrent.map(JSON.parse).filter(r=>r.generationEligible).length,1);
  const active = JSON.parse(concurrent[0]).share.token;
  assert.notEqual(active,first);
  assert.equal(sql("set role service_role; "+generated(active)),"t");
  assert.equal(sql(generated(active)),"f");
  assert.equal(JSON.parse(sql(`select public.read_replay_share_with_title('${active}');`)).title,"A factual title");
  assert.equal(sql(`select count(*) from public.replay_shares where game_id='${id}' and revoked_at is null;`),"1");
  sql(`update public.replay_shares set expires_at=clock_timestamp()-interval '1 second' where game_id='${id}' and revoked_at is null;`);
  assert.equal(sql(`select coalesce(public.read_replay_share_with_title('${active}')::text,'null');`),"null");
  assert.deepEqual(JSON.parse(sql(call("read", ""))),{share:null});
  assert.equal(JSON.parse(sql(call("create", token()))).outcome,"denied");
  assert.equal(sql(`select count(*) from public.replay_shares where game_id='${id}';`),"2");
  sql(`update public.usage_allowances set attempts='{}' where key='share:owner:${hash}';`);
  const renewed = JSON.parse(sql(call("create", token())));
  assert.notEqual(renewed.share.token,active);
  assert.equal(sql(`select coalesce(public.read_replay_share_with_title('${active}')::text,'null');`),"null");
  // Owner browsing is independent of current assignments and recent Actions windows.
  const list = (owner, cursor = null) => JSON.parse(sql(`set role service_role; select public.list_replay_shares_with_title('${owner}',${cursor ? `'${cursor.beforeCreatedAt}'::timestamptz,'${cursor.beforeToken}'` : 'null,null'});`));
  const exact = (link, owner = "historical-owner") => `select public.revoke_owned_replay_share('${owner}','${link}');`;
  for (const role of ["anon", "authenticated"]) {
    assert.equal(sql(`select has_function_privilege('${role}','public.list_replay_shares_with_title(text,timestamptz,text)','execute');`), "f");
    assert.throws(() => sql(`set role ${role}; ${exact(renewed.share.token)}`));
  }
  assert.deepEqual(list("other-owner"), {shares:[],nextCursor:null});
  assert.deepEqual(list(""), {shares:[],nextCursor:null});
  assert.equal(list("historical-owner").shares[0].token, renewed.share.token);
  assert.deepEqual(Object.keys(list("historical-owner").shares[0]).sort(), ["createdAt","expiresAt","handNumber","title","titleRevision","token"]);
  sql(exact(renewed.share.token, "other-owner"));
  assert.equal(list("historical-owner").shares.length, 1);
  // Expiry boundary is exclusive. A stale exact token cannot revoke its replacement,
  // even when creation and revocation contend for the game lock.
  sql(`update public.replay_shares set expires_at=clock_timestamp() where link_token='${renewed.share.token}';`);
  assert.equal(list("historical-owner").shares.length, 0);
  const replacement = token();
  await Promise.all([parallelSQL(call("create", replacement)), parallelSQL(exact(renewed.share.token))]);
  assert.equal(list("historical-owner").shares[0].token, replacement);
  sql(exact(renewed.share.token));
  assert.equal(list("historical-owner").shares[0].token, replacement);
  sql(exact(replacement)); sql(exact(replacement));
  assert.equal(list("historical-owner").shares.length, 0);
  sql(`insert into public.hands(game_id,hand_number,status,initial_state,final_state,completed_at)
    select '${id}',n,'complete','{}','{}',now() from generate_series(2,70) n;
    insert into public.replay_shares(link_token,game_id,hand_id,creator_token,snapshot,created_at,expires_at)
    select '${pagePrefix}'||lpad(to_hex(n),16,'0'),'${id}',h.id,'paged-owner','{"schemaVersion":1}',
      '2026-01-01T00:00:00.123456Z',clock_timestamp()+interval '30 days'
    from generate_series(1,45) n join public.hands h on h.game_id='${id}' and h.hand_number=n;`);
  const firstPage=list("paged-owner");
  assert.equal(firstPage.shares.length,20); assert.ok(firstPage.nextCursor);
  const secondPage=list("paged-owner", firstPage.nextCursor);
  const lastPage=list("paged-owner", secondPage.nextCursor);
  assert.equal(secondPage.shares.length,20); assert.equal(lastPage.shares.length,5); assert.equal(lastPage.nextCursor,null);
  const all=[...firstPage.shares,...secondPage.shares,...lastPage.shares];
  assert.equal(new Set(all.map(row=>row.token)).size,45);
  assert.deepEqual(all.map(row=>row.handNumber),Array.from({length:45},(_,i)=>45-i));
  assert.equal(all.at(-1).handNumber,1); // older than the latest 50 completed hands
  assert.deepEqual(JSON.parse(sql(`begin; update public.replay_shares set expires_at=statement_timestamp() where creator_token='paged-owner' and game_id='${id}';
    select public.list_replay_shares_with_title('paged-owner'); rollback;`)),{shares:[],nextCursor:null});
  sql(`delete from public.games where id='${id}';`);
  assert.equal(sql(`select count(*) from public.replay_shares where game_id='${id}';`),"0");
  assert.equal(sql(`select coalesce(public.read_replay_share_with_title('${first}')::text,'null');`),"null");
  assert.equal(list("paged-owner").shares.length,0);
  sql(exact(replacement));
  console.log("Share SQL: owner pagination, exact-link replacement safety, roles, historical ownership, history recheck, concurrency, fixed expiry/snapshot, separate admission, revocation, expiration and cascade passed.");
} finally {
  sql(`delete from public.games where id='${id}'; delete from public.usage_allowances where key in ('share:owner:${hash}','share:ip:${ip}');`);
}
