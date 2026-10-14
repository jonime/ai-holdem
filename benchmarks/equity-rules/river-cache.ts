import { minimumRiverShare as exactShare } from "@/lib/poker/adapter";

// Memoization only: the shared adapter still exhaustively evaluates unseen holdings.
// Keep card order in keys, and report latency as warm-cache benchmark latency.
const cache = new Map<string, number>();
export function minimumRiverShare(hole: readonly string[], board: readonly string[]) {
  const key = JSON.stringify([hole, board]), cached = cache.get(key);
  if (cached !== undefined) return cached;
  const share = exactShare(hole, board);
  if (cache.size >= 100_000) cache.clear();
  cache.set(key, share);
  return share;
}
