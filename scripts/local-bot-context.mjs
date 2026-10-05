/** Local-only additive RPC tests. No application env, credentials, providers or DB reset. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const args = ["exec","-i","supabase_db_ai-holdem","psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-At"];
function sql(input) { return execFileSync("docker",args,{ input,encoding:"utf8",timeout:30000,stdio:["pipe","pipe","pipe"] }).trim(); }
const first=randomUUID(), second=randomUUID();
const result = sql(`begin;
  insert into public.games (id,current_state,hand_number,status,version) values
    ('${first}','{}',2,'playing',7), ('${second}','{}',1,'playing',9);
  insert into public.game_players (game_id,seat,name,controller,stack,status,engine_player_id)
    values ('${first}',0,'Duplicate','human',200,'claimed','first'),('${second}',0,'Duplicate','human',200,'claimed','second');
  insert into public.hands (game_id,hand_number,status,initial_state) values
    ('${first}',1,'playing','{"marker":"old"}'),('${first}',2,'playing','{"marker":"current"}'),('${second}',1,'playing','{"marker":"other"}');
  insert into public.actions (game_id,hand_id,player_id,sequence,street,action,amount,state_before,state_after)
    select h.game_id,h.id,p.id,n,'preflop','raise',n*4,jsonb_build_object('marker',h.initial_state->>'marker','sequence',n),'{}'
    from public.hands h join public.game_players p on p.game_id=h.game_id cross join generate_series(1,2) n
    where h.game_id in ('${first}','${second}') order by n desc;
  -- Deliberately mismatched game/hand foreign keys must not leak into the read.
  insert into public.actions (game_id,hand_id,player_id,sequence,street,action,amount,state_before,state_after)
    select '${second}',h.id,p.id,3,'preflop','raise',20,'{"marker":"cross-game"}','{}'
    from public.hands h join public.game_players p on p.game_id=h.game_id
    where h.game_id='${first}' and h.hand_number=2;
  set local role service_role;
  select public.get_bot_hand_context('${first}',2);
  select public.get_bot_hand_context('${first}',1);
  select public.get_bot_hand_context('${second}',1);
  select coalesce(public.get_bot_hand_context('${first}',3)::text,'null');
  reset role;
  select has_function_privilege('anon','public.get_bot_hand_context(uuid,integer)','execute');
  select has_function_privilege('authenticated','public.get_bot_hand_context(uuid,integer)','execute');
  rollback;`);
const lines=result.split("\n").filter(line => line.startsWith("{") || line === "null" || line === "f");
assert.equal(lines.length,6);
for (const [index,marker] of ["current","old","other"].entries()) {
  const data=JSON.parse(lines[index]);
  assert.equal(data.initialState.marker,marker);
  assert.equal(data.version,index === 2 ? 9 : 7);
  assert.equal(data.handNumber,index === 0 ? 2 : 1);
  assert.deepEqual(data.actions.map(a => a.sequence),[1,2]);
  assert(data.actions.every(a => a.stateBefore.marker === marker));
  assert.deepEqual(Object.keys(data.actions[0]).sort(),["action","amount","sequence","stateBefore"].sort());
}
assert.equal(lines[3],"null");
assert.deepEqual(lines.slice(4),["f","f"]);
for (const role of ["anon","authenticated"]) {
  assert.throws(() => sql(`begin; set local role ${role}; select public.get_bot_hand_context('${first}',2); rollback;`),
    error => String(error.stderr).includes("permission denied for function get_bot_hand_context"));
}
console.log("Bot hand context: ordered actions, game/hand isolation, missing rows and service-role-only access passed (rolled-back fixtures).");
