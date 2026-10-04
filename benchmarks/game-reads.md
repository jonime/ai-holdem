# Local game-state read benchmark

Run `npm run benchmark:game-reads` with migrated local Supabase running. The
script reads local credentials from `supabase status`; it never loads `.env`,
prints credentials, or connects to a remote database. It creates uniquely named
fixtures and removes them in `finally`. It does not reset existing games.

The benchmark compares database HTTP I/O for the original **host** refresh
(five sequential `select=*` requests: game, assignments, host, listing, all game
reveals) with one snapshot RPC. Spectators previously used four requests because
they did not load listings. Both paths use exactly the same six-seat fixture and
constant representative serialized state payload; engine restoration and public
projection are outside this measurement. Each hand has one reveal. The 1,000-hand
fixture stays within local PostgREST's 1,000-row limit, so the old read transfers
all history without truncation. Beyond that limit the old reader could also miss
current-hand reveals. The new lookup filters by game and current hand in SQL.

After five warm-up pairs, the script records 100 pairs, alternating order.
`GAME_READ_SAMPLES=200 npm run benchmark:game-reads` changes the sample count.
Bytes mean UTF-8 response body bytes summed across requests, excluding HTTP
headers, request bodies, and transport framing. Median and p95 measure the whole
sequential read path over loopback HTTP. No wall-clock threshold runs in CI.

## Recorded run: 2026-10-04

Node 24.21.0, local Docker Supabase, 100 measured pairs per fixture. Build and
browser verification were also running, so treat latency as local evidence,
not a production forecast.

| History | Path | Requests | Response bytes | Median ms | p95 ms |
| --- | --- | ---: | ---: | ---: | ---: |
| 10 hands | Original host refresh | 5 | 8,205 | 10.56 | 13.82 |
| 10 hands | Snapshot | 1 | 5,327 | 2.66 | 4.90 |
| 1,000 hands | Original host refresh | 5 | 319,969 | 14.26 | 18.68 |
| 1,000 hands | Snapshot | 1 | 5,329 | 2.52 | 3.20 |

Snapshot response size differs by two bytes for the larger hand number; it does
not include historical reveals. The long-history run transferred about 98.3%
fewer bytes and reduced median database HTTP latency about 82.3%.

## Reveal query plans

The script runs `ANALYZE` then `EXPLAIN (ANALYZE, BUFFERS)` on the standalone
lookup, with both predicates and only `engine_player_id` selected. The snapshot
uses the same predicates against its game row.

Ten rows: PostgreSQL chose a sequential scan, one shared buffer, nine rows
removed by the filter, execution 0.048 ms. That is reasonable for one tiny page.

One thousand rows:

```text
Index Only Scan using hand_card_reveals_game_hand_idx on hand_card_reveals
  Index Cond: ((game_id = <fixture uuid>) AND (hand_number = 1000))
  actual rows=1 loops=1
  Heap Fetches: 1
  Buffers: shared hit=3
Planning Time: 0.237 ms
Execution Time: 0.064 ms
```

The included engine ID supports the index-only plan. Newly inserted fixtures
still need a visibility check in the heap; normal vacuuming can remove that
fetch. Query work finds the requested hand rather than loading historical
reveals into application memory.
