"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { requestJson } from "@/lib/http/request-json";
import { gameFeedEnvelopeSchema } from "@/lib/http/schemas";
import { FeedSynchronizer } from "./feed-synchronizer";
import type { GameFeed } from "./types";

export function useGameFeed(gameId?: string) {
  const [snapshot, setSnapshot] = useState<{
    gameId: string;
    feed: GameFeed;
  } | null>(null);
  if (snapshot && snapshot.gameId !== gameId) setSnapshot(null);
  const synchronizer = useRef<FeedSynchronizer | null>(null);

  useEffect(() => {
    if (!gameId) return;
    const reader = new FeedSynchronizer(async (sinceHand, signal) => {
      const query = sinceHand === undefined ? "" : `?sinceHand=${sinceHand}`;
      const body = await requestJson<{ feed: GameFeed }>(
        `/api/games/${gameId}/feed${query}`,
        { cache: "no-store", signal },
        gameFeedEnvelopeSchema,
      );
      return body.feed;
    }, feed => setSnapshot({ gameId, feed }));
    synchronizer.current = reader;
    return () => {
      reader.dispose();
      synchronizer.current = null;
    };
  }, [gameId]);

  const refreshFeed = useCallback((version: number) => {
    synchronizer.current?.refresh(version);
  }, []);

  return {
    feed: snapshot && snapshot.gameId === gameId ? snapshot.feed : null,
    refreshFeed,
  };
}
