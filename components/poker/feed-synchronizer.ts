import { GAME_FEED_HAND_LIMIT } from "@/lib/constants";
import { createRefreshTimeout } from "@/lib/realtime/refresh-coordinator";
import type { GameFeed } from "./types";

export function mergeGameFeed(
  cached: GameFeed | null,
  incoming: GameFeed,
  sinceHand?: number,
): GameFeed {
  const events = [
    ...(sinceHand === undefined
      ? []
      : (cached?.events ?? []).filter(event => event.handNumber < sinceHand)),
    ...incoming.events,
  ];
  const hands = [...new Set(events.map(event => event.handNumber))].sort((a, b) => a - b);
  const retained = new Set(hands.slice(-GAME_FEED_HAND_LIMIT));
  return { events: events.filter(event => retained.has(event.handNumber)) };
}

export type FeedLoader = (
  sinceHand: number | undefined,
  signal: AbortSignal,
) => Promise<GameFeed>;

/** One serialized feed reader per mounted game session. */
export class FeedSynchronizer {
  private feed: GameFeed | null = null;
  private coveredVersion = -1;
  private requestedVersion = -1;
  private pending = false;
  private running = false;
  private disposed = false;
  private controller: AbortController | null = null;

  constructor(
    private readonly load: FeedLoader,
    private readonly update: (feed: GameFeed) => void,
  ) {}

  refresh(version: number) {
    if (this.disposed || version <= this.coveredVersion) return;
    this.requestedVersion = Math.max(version, this.requestedVersion);
    this.pending = true;
    if (!this.running) void this.run();
  }

  dispose() {
    this.disposed = true;
    this.controller?.abort();
  }

  private async run() {
    this.running = true;
    try {
      while (this.pending && !this.disposed) {
        this.pending = false;
        const version = this.requestedVersion;
        const hands = this.feed?.events.map(event => event.handNumber) ?? [];
        const sinceHand = hands.length ? Math.max(...hands) : undefined;
        const { controller, cancel } = createRefreshTimeout();
        this.controller = controller;
        try {
          const incoming = await this.load(sinceHand, controller.signal);
          if (this.disposed) return;
          this.feed = mergeGameFeed(this.feed, incoming, sinceHand);
          this.coveredVersion = version;
          this.update(this.feed);
          this.pending = this.requestedVersion > this.coveredVersion;
        } catch {
          // Keep cached history. A later authoritative refresh retries this version.
          // If a newer refresh arrived while loading, process it once now.
          this.pending = this.pending && this.requestedVersion > version;
        } finally {
          cancel();
          this.controller = null;
        }
      }
    } finally {
      this.running = false;
    }
  }
}
