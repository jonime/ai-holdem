"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/http/api";
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
      const body = await api.games.feed({ gameId, sinceHand }, { signal });
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
