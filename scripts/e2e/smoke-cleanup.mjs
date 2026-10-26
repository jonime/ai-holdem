const conflict = async response => !response.ok() && response.status() === 409 &&
  (await response.json()).code === "GAME_CONFLICT";
const settle = attempt => new Promise(resolve => setTimeout(resolve, 100 * attempt));

/** Only IDs returned by this run's successful creation requests enter this ledger. */
export async function cleanupTables(tables) {
  const failures = [];
  for (const table of [...tables].reverse()) {
    for (const guest of table.guests) {
      try {
        for (let attempt = 1; attempt <= 3; attempt++) {
          const read = await guest.get(`/api/games/${table.id}`);
          if (!read.ok()) throw new Error();
          const { game } = await read.json();
          const seat = game.poker.players.find(player => player.controller === "human" && player.playerToken);
          if (!seat) break;
          const response = await guest.post(`/api/games/${table.id}/seats/${seat.seat}/release`, { data: { expectedVersion: game.version } });
          if (response.ok()) break;
          if (attempt === 3 || !await conflict(response)) throw new Error();
          await settle(attempt);
        }
      } catch { failures.push(`Guest release failed for run table ${table.id}`); }
    }
    try {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const read = await table.owner.get(`/api/games/${table.id}`);
        if (read.status() === 404) break;
        if (!read.ok()) throw new Error();
        const { game } = await read.json();
        const removed = await table.owner.post(`/api/games/${table.id}/remove`, { data: { expectedVersion: game.version, operation: "delete" } });
        if (removed.ok()) {
          if ((await table.owner.get(`/api/games/${table.id}`)).status() !== 404) throw new Error();
          break;
        }
        // A bot step may finish after navigation. Retry only acknowledged version conflicts.
        if (attempt === 3 || !await conflict(removed)) throw new Error();
        await settle(attempt);
      }
    } catch { failures.push(`Deletion failed for run table ${table.id}`); }
  }
  return failures;
}
