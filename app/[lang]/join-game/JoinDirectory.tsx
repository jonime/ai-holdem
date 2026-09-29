"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { Locale } from "@/lib/i18n";
import type { JoinGameDictionary } from "@/lib/i18n/types";
import type { PublicGameDirectoryEntry } from "@/lib/supabase/queries";
import { publicDirectoryEnvelopeSchema } from "@/lib/http/schemas";
import styles from "./page.module.css";

const nameKey = "ai-holdem-player-name";
function text(dictionary: JoinGameDictionary, key: keyof JoinGameDictionary, values?: Record<string, string | number>) {
  return dictionary[key].replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`));
}

export function JoinDirectory({ locale, dictionary, initialGames, initialCursor, initialError }: {
  readonly locale: Locale;
  readonly dictionary: JoinGameDictionary;
  readonly initialGames: readonly PublicGameDirectoryEntry[];
  readonly initialCursor: string | null;
  readonly initialError: boolean;
}) {
  const router = useRouter();
  const [games, setGames] = useState(initialGames);
  const [cursor, setCursor] = useState(initialCursor);
  const [name, setName] = useState(() => typeof window === "undefined" ? "" : (window.localStorage.getItem(nameKey) ?? ""));
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [warning, setWarning] = useState(initialError);
  const [message, setMessage] = useState<string | null>(initialError ? dictionary.initialError : null);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/games/public", { cache: "no-store" });
      if (!response.ok) throw new Error("refresh failed");
      const body = publicDirectoryEnvelopeSchema.parse(await response.json());
      setGames(body.games);
      setCursor(typeof body.nextCursor === "string" ? body.nextCursor : null);
      setWarning(false);
      setMessage(null);
    } catch {
      setWarning(true);
      setMessage(games.length ? dictionary.warning : dictionary.initialError);
    } finally {
      setRefreshing(false);
    }
  }, [dictionary.initialError, dictionary.warning, games.length]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const schedule = () => {
      if (timer) clearInterval(timer);
      timer = document.visibilityState === "visible" ? setInterval(() => void refresh(), 15_000) : null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
      schedule();
    };
    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const response = await fetch(`/api/games/public?cursor=${encodeURIComponent(cursor)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      const body = publicDirectoryEnvelopeSchema.parse(await response.json());
      setGames((current) => [...current, ...body.games.filter((entry) => !current.some((item) => item.gameId === entry.gameId))]);
      setCursor(body.nextCursor);
    } catch {
      setWarning(true);
      setMessage(dictionary.warning);
    } finally {
      setLoadingMore(false);
    }
  };

  const join = async (game: PublicGameDirectoryEntry) => {
    setJoiningId(game.gameId);
    setMessage(null);
    window.localStorage.setItem(nameKey, name);
    try {
      const response = await fetch(`/api/games/${game.gameId}/join`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: game.version, ...(name.trim() ? { name } : {}) }),
      });
      if (response.ok) {
        router.push(`/${locale}/game/${game.gameId}`);
        return;
      }
      const body = await response.json().catch(() => null) as { code?: string } | null;
      await refresh();
      setMessage(body?.code === "GAME_CONFLICT" ? dictionary.conflict : dictionary.unavailable);
    } catch {
      await refresh();
      setMessage(dictionary.unavailable);
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div>
      <label className={styles.nameField}>{dictionary.playerName}
        <input maxLength={30} value={name} placeholder={dictionary.namePlaceholder} onChange={(event) => { setName(event.target.value); window.localStorage.setItem(nameKey, event.target.value); }} />
      </label>
      <div className={styles.toolbar}>
        <button type="button" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? dictionary.refreshing : dictionary.refresh}</button>
      </div>
      {message && <p className={warning ? styles.warning : styles.notice} role="status">{message}</p>}
      {games.length === 0 ? (
        <div className={styles.empty}><p>{initialError ? dictionary.initialError : dictionary.empty}</p><button type="button" onClick={() => void refresh()}>{dictionary.retry}</button></div>
      ) : (
        <ul className={styles.list}>{games.map((game) => <li key={game.gameId} className={styles.card}>
          <div><h2>{game.title ?? text(dictionary, "fallbackTitle", { id: game.gameId.slice(0, 8) })}</h2>
            <div className={styles.facts}>
              <span>{text(dictionary, "seats", { occupied: game.occupiedSeats, total: game.totalSeats })}</span>
              <span>{text(dictionary, "people", { humans: game.humanCount, bots: game.botCount })}</span>
              <span>{text(dictionary, "blinds", { small: game.smallBlind, big: game.bigBlind })}</span>
              <span>{text(dictionary, "stack", { stack: game.startingStack })}</span>
            </div></div>
          <button type="button" onClick={() => void join(game)} disabled={joiningId !== null}>{joiningId === game.gameId ? dictionary.joining : dictionary.join}</button>
        </li>)}</ul>
      )}
      {cursor && <button className={styles.loadMore} type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? dictionary.loadingMore : dictionary.loadMore}</button>}
    </div>
  );
}
