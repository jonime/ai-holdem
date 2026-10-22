/** Fixture-only local SQL verification; never reads application env or provider credentials. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const sql = input => execFileSync("docker", ["exec", "-i", "supabase_db_ai-holdem", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"],
  { input, encoding: "utf8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"] }).trim();
const id = randomUUID(), other = randomUUID();
try {
  sql(`insert into public.games(id,current_state,hand_number,status) values ('${id}','{}',207,'playing'),('${other}','{}',1,'complete');
    insert into public.hands(game_id,hand_number,status,initial_state,final_state,completed_at)
      select '${id}',n,'complete',jsonb_build_object('marker',n),jsonb_build_object('marker',n),now() from generate_series(1,205) n;
    insert into public.hands(game_id,hand_number,status,initial_state,final_state,completed_at)
      values ('${id}',207,'playing','{}',null,null),('${other}',1,'complete','{"private":"other"}','{}',now());`);
  for (const role of ["anon", "authenticated"]) {
    assert.equal(sql(`select has_function_privilege('${role}','public.get_personal_results_page(uuid,integer,integer)','execute');`), "f");
    assert.throws(() => sql(`set role ${role}; select public.get_personal_results_page('${id}');`), error => String(error.stderr).includes("permission denied for function"));
  }
  const read = (after = 0, through) => JSON.parse(sql(`set role service_role; select public.get_personal_results_page('${id}',${after},${through ?? 'null'});`));
  const first = read();
  assert.equal(first.throughHand,206); // Missing hand 206 remains visible as a coverage gap.
  assert.equal(first.hands.length,100);
  assert.deepEqual(first.hands.map(h => h.handNumber),Array.from({ length: 100 },(_, i) => i + 1));
  assert.deepEqual(Object.keys(first.hands[0]).sort(),['finalState','handNumber','initialState']);
  // A completion between pages cannot shift the original boundary or include the active hand.
  sql(`update public.hands set status='complete',final_state='{}',completed_at=now() where game_id='${id}' and hand_number=207;
    update public.games set status='complete' where id='${id}';`);
  const second = read(100,first.throughHand);
  assert.equal(second.throughHand,206); assert.equal(second.hands.length,100);
  const last = read(200,first.throughHand);
  assert.deepEqual(last.hands.map(h => h.handNumber),[201,202,203,204,205]);
  assert.equal(read(205,first.throughHand).hands.length,0);
  assert.equal(read().throughHand,207);
  assert.equal(JSON.stringify([first,second,last]).includes('other'),false);
  const absent = sql(`select coalesce(public.get_personal_results_page('${randomUUID()}')::text,'null');`);
  assert.equal(absent,'null');
  sql(`delete from public.hands where game_id='${id}' and hand_number=100;`);
  assert.equal(read(99,206).hands[0].handNumber,101);
  console.log("Personal results SQL: restricted roles, 205 hands, 100-row keyset pages, missing history, fixed completion boundary and game isolation passed.");
} finally {
  sql(`delete from public.games where id in ('${id}','${other}');`);
}
