/** Local disposable fixtures only; no application environment or provider access. */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
const args = ["exec", "-i", "supabase_db_ai-holdem", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
const sql = input => execFileSync("docker", args, { input, encoding: "utf8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"] }).trim();
const id = randomUUID(), other = randomUUID();
let writer, completion;
try {
  sql(`begin;
    insert into public.games(id,current_state) values ('${id}','{}'),('${other}','{}');
    insert into public.game_players(game_id,seat,name,controller,stack,engine_player_id)
      values ('${id}',0,'Same','human',100,'p0'),('${id}',1,'Extra','human',100,'p1'),('${other}',0,'Same','human',100,'p0');
    insert into public.hands(game_id,hand_number,status,initial_state,final_state,completed_at)
      select g.id,n,'complete','{"marker":1}','{"marker":1}',now() from public.games g cross join generate_series(1,2) n where g.id in ('${id}','${other}');
    insert into public.actions(game_id,hand_id,player_id,sequence,street,action,state_before,state_after)
      select h.game_id,h.id,p.id,n,'preflop','fold','{"marker":1}','{}' from public.hands h join public.game_players p on p.game_id=h.game_id and p.seat=0
      cross join generate_series(1,2) n where h.game_id in ('${id}','${other}') order by n desc;
    insert into public.hand_card_reveals(game_id,hand_id,player_id,hand_number,engine_player_id,reason)
      select h.game_id,h.id,p.id,h.hand_number,'before','voluntary' from public.hands h join public.game_players p on p.game_id=h.game_id and p.seat=0 where h.game_id in ('${id}','${other}');
    -- Deliberately mismatched foreign keys must never enter the hand read.
    insert into public.actions(game_id,hand_id,player_id,sequence,street,action,state_before,state_after)
      select '${other}',h.id,p.id,3,'preflop','fold','{"marker":"cross"}','{}' from public.hands h join public.game_players p on p.game_id='${other}' where h.game_id='${id}' and h.hand_number=1;
    insert into public.hand_card_reveals(game_id,hand_id,player_id,hand_number,engine_player_id,reason)
      select '${other}',h.id,p.id,1,'cross-game','voluntary' from public.hands h join public.game_players p on p.game_id='${other}' where h.game_id='${id}' and h.hand_number=1;
    insert into public.hand_card_reveals(game_id,hand_id,player_id,hand_number,engine_player_id,reason)
      select h.game_id,h.id,p.id,2,'cross-hand','voluntary' from public.hands h join public.game_players p on p.game_id=h.game_id and p.seat=1 where h.game_id='${id}' and h.hand_number=1;
    commit;`);
  for (const role of ["anon", "authenticated"]) {
    assert.equal(sql(`select has_function_privilege('${role}','public.get_hand_replay(uuid,integer)','execute');`), "f");
    assert.throws(() => sql(`set role ${role}; select public.get_hand_replay('${id}',1);`), error => String(error.stderr).includes("permission denied for function get_hand_replay"));
  }
  const read = () => JSON.parse(sql(`set role service_role; select public.get_hand_replay('${id}',1);`));
  const check = (row, marker, reveal) => {
    assert.equal(row.gameId,id); assert.equal(row.handNumber,1); assert.equal(row.status,"complete");
    assert.equal(row.initialState.marker,marker); assert.equal(row.finalState.marker,marker);
    assert.deepEqual(row.actions.map(a => a.sequence),[1,2]);
    assert(row.actions.every(a => a.stateBefore.marker === marker && a.actorSeat === 0));
    assert.deepEqual(row.revealedIds,[reveal]);
  };
  check(read(),1,"before");
  assert.equal(sql(`select coalesce(public.get_hand_replay('${id}',3)::text,'null');`),"null");
  writer = spawn("docker",args,{ stdio: ["pipe","pipe","pipe"] });
  let stderr = ""; writer.stderr.on("data",chunk => { stderr += chunk; });
  completion = new Promise((resolve,reject) => { writer.on("error",reject); writer.on("close",code => code === 0 ? resolve() : reject(new Error(stderr))); });
  completion.catch(() => {});
  const timeout = setTimeout(() => writer.kill(),30000);
  completion.finally(() => clearTimeout(timeout)).catch(() => {});
  let output = "";
  const partial = new Promise(resolve => writer.stdout.on("data",chunk => { output += chunk; if (output.includes("partial")) resolve(); }));
  writer.stdin.write(`begin; update public.hands set initial_state='{"marker":2}' where game_id='${id}' and hand_number=1; select 'partial';\n`);
  await Promise.race([partial,completion.then(() => { throw new Error("Writer exited early"); })]);
  check(read(),1,"before");
  writer.stdin.end(`update public.hands set final_state='{"marker":2}' where game_id='${id}' and hand_number=1;
    update public.actions set state_before='{"marker":2}' where game_id='${id}' and hand_id=(select id from public.hands where game_id='${id}' and hand_number=1);
    update public.hand_card_reveals set engine_player_id='after' where game_id='${id}' and hand_number=1;
    commit;\n`);
  await completion;
  check(read(),2,"after");
  sql(`delete from public.hand_card_reveals where game_id in ('${id}','${other}'); delete from public.actions where game_id in ('${id}','${other}'); delete from public.games where id in ('${id}','${other}');`);
  assert.equal(sql(`select coalesce(public.get_hand_replay('${id}',1)::text,'null');`),"null");
  console.log("Replay SQL: restricted roles, ordered actions, game/hand reveal isolation, missing/deleted hands and committed snapshot consistency passed.");
} finally {
  if (writer && writer.exitCode === null) { writer.kill(); await completion.catch(() => {}); }
  sql(`begin; delete from public.hand_card_reveals where game_id in ('${id}','${other}'); delete from public.actions where game_id in ('${id}','${other}'); delete from public.games where id in ('${id}','${other}'); commit;`);
}
