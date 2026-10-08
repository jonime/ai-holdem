"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { addLocalePrefix, type Locale } from "@/lib/i18n";
import type { JoinGameDictionary } from "@/lib/i18n/types";
import type { PublicGameDirectoryEntry } from "@/lib/http/discovery-contracts";
import { api, HttpError } from "@/lib/http/api";
import { usePlayerName } from "./PlayerName";
import { FiChevronRight, FiRefreshCw } from "react-icons/fi";
import styles from "./page.module.css";

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
  const name = usePlayerName();
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [warning, setWarning] = useState(initialError);
  const [message, setMessage] = useState<string | null>(initialError ? dictionary.initialError : null);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const body = await api.discovery.list();
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


  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const body = await api.discovery.list({ cursor });
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
    try {
      await api.discovery.join({ gameId: game.gameId, expectedVersion: game.version, ...(name.trim() ? { name } : {}) });
      router.push(addLocalePrefix(`/game/${game.gameId}`, locale));
    } catch (error) {
      await refresh();
      setMessage(error instanceof HttpError && error.code === "GAME_CONFLICT" ? dictionary.conflict : dictionary.unavailable);
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div>
      <button className={styles.iconButton} type="button" onClick={() => void refresh()} disabled={refreshing || loadingMore || joiningId !== null}
        aria-label={refreshing ? dictionary.refreshing : warning ? dictionary.retry : dictionary.refresh}
        title={warning ? dictionary.retry : dictionary.refresh}>
        <FiRefreshCw aria-hidden="true" className={refreshing ? styles.spinning : undefined} />
      </button>
      {(refreshing || loadingMore) && <p role="status">{dictionary.refreshing}</p>}
      {message && <p className={warning ? styles.warning : styles.notice} role="status">{message}</p>}
      {games.length === 0 ? (
        !warning && <div className={styles.empty}><p>{dictionary.empty}</p></div>
      ) : (
        <ul className={styles.list}>{games.map(game => {
          const title = game.title ?? text(dictionary, "fallbackTitle", { id: game.gameId.slice(0, 8) });
          return <li key={game.gameId}>
            <button className={styles.tableRow} type="button" onClick={() => void join(game)} disabled={joiningId !== null || refreshing || loadingMore}
              aria-label={`${joiningId === game.gameId ? dictionary.joining : dictionary.join}: ${title}`} aria-busy={joiningId === game.gameId}>
              <span className={styles.rowTitle}>{title}</span>
              <span className={styles.facts}>
                <span>{text(dictionary, "seats", { occupied: game.occupiedSeats, total: game.totalSeats })}</span>
                <span>{text(dictionary, "people", { humans: game.humanCount, bots: game.botCount })}</span>
                <span>{text(dictionary, "blinds", { small: game.smallBlind, big: game.bigBlind })}</span>
                <span>{text(dictionary, "stack", { stack: game.startingStack })}</span>
                <span>{text(dictionary, "turnTimer", { duration: game.humanTurnSeconds == null ? dictionary.timerOff : text(dictionary, "timerDuration", { seconds: game.humanTurnSeconds }) })}</span>
              </span>
              {joiningId === game.gameId ? <span className={styles.rowArrow}>{dictionary.joining}</span> : <FiChevronRight className={styles.rowArrow} aria-hidden="true" />}
            </button>
          </li>;
        })}</ul>
      )}
      {cursor && <button className={styles.loadMore} type="button" disabled={loadingMore || refreshing || joiningId !== null} onClick={() => void loadMore()}>{loadingMore ? dictionary.loadingMore : dictionary.loadMore}</button>}
    </div>
  );
}
