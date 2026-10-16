"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { api, HttpError } from "@/lib/http/api";
import { replayOutcomeSchema, type HandReplay } from "@/lib/http/replay-contracts";
import { Modal } from "./Modal";
import { SeatRoleBadge } from "./SeatRoleBadge";
import { PlayingCard } from "./PlayingCard";
import { useI18n } from "./I18nProvider";
import { Button } from "@/components/Button";
import { formatChips } from "./view-model";
import { TurnCountdown } from "./TurnCountdown";
import type { Game } from "./types";
import styles from "./HandReplayModal.module.css";
import seatStyles from "./Seat.module.css";

export function HandReplayModal({ gameId, handNumber, game, yourTurn, onClose, onBack, restoreFocus, fallbackFocus }: {
  gameId: string; handNumber: number; game: Game | null; yourTurn: boolean;
  onClose: () => void; onBack?: () => void;
  restoreFocus: RefObject<HTMLElement | null>; fallbackFocus: RefObject<HTMLElement | null>;
}) {
  const { t, dictionary, locale } = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [load, setLoad] = useState<{ status: "loading" | "unavailable" | "error" } | { status: "ready"; replay: HandReplay }>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [index, setIndex] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const request = ++generation.current;
    const controller = new AbortController();
    api.games.replay({ gameId, handNumber }, { signal: controller.signal }).then(({ replay }) => {
      if (generation.current === request && !controller.signal.aborted) setLoad({ status: "ready", replay });
    }).catch(error => {
      if (generation.current !== request || controller.signal.aborted) return;
      setLoad({ status: error instanceof HttpError && replayOutcomeSchema.safeParse(error.code).success ? "unavailable" : "error" });
    });
    return () => { controller.abort(); };
  }, [gameId, handNumber, attempt]);
  const replay = load.status === "ready" ? load.replay : null;
  const frameCount = replay?.frames.length ?? 0;
  // Native dialogs may lose button focus when a boundary disables that button.
  // Own arrow keys for the open modal's lifetime, including neutral dialog focus.
  useEffect(() => {
    if (frameCount === 0) return;
    const dialog = contentRef.current?.closest("dialog");
    if (!dialog) return;
    const navigate = (event: KeyboardEvent) => {
      if (!dialog.open || !dialog.matches(":modal") || event.defaultPrevented ||
          event.altKey || event.ctrlKey || event.metaKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select"))) return;
      event.preventDefault();
      event.stopPropagation();
      const delta = event.key === "ArrowLeft" ? -1 : 1;
      setIndex(current => Math.max(0, Math.min(frameCount - 1, current + delta)));
    };
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [frameCount]);
  const frame = replay?.frames[index];
  const name = (seat: number) => replay?.participants.find(p => p.seat === seat)?.name ?? "";
  const lastAction = replay?.frames.slice(0, index + 1).findLast(f => f.action)?.action;
  const total = replay?.frames.filter(f => f.action).length ?? 0;
  const awards = new Map<number, number>();
  if (frame?.kind === "result") {
    for (const pot of replay?.pots ?? []) for (const award of pot.awards) {
      awards.set(award.seat, (awards.get(award.seat) ?? 0) + award.amount);
    }
  }
  const move = (delta: number) => setIndex(i => Math.max(0, Math.min((replay?.frames.length ?? 1) - 1, i + delta)));
  return <Modal open title={t("replay.title")} onDismiss={onClose} initialFocus={closeRef}
    restoreFocus={restoreFocus} fallbackFocus={fallbackFocus} className={styles.dialog}>
    <div ref={contentRef} className={styles.content}>
      <header className={styles.controls}><h2>{t("replay.title")} · {t("feed.hand", { hand: handNumber })}</h2>
        <div className={styles.headerActions}>
          {yourTurn && game ? <span role="status" className={styles.turn}>{t("replay.yourTurn")} <TurnCountdown game={game} always /></span> : null}
          <Button ref={closeRef} onClick={onClose}>{t("replay.close")}</Button>
        </div></header>
      {load.status !== "ready" ? <p role="status">{t(load.status === "loading" ? "replay.loading" : load.status === "unavailable" ? "replay.unavailable" : "replay.error")}
        {load.status === "error" ? <Button onClick={() => { setLoad({ status: "loading" }); setIndex(0); setAttempt(a => a + 1); }}>{t("replay.retry")}</Button> : null}</p> : null}
      {replay && frame ? <>
        <nav className={`${styles.controls} ${styles.streets}`} aria-label={t("replay.title")}>
          {(["preflop", "flop", "turn", "river", "complete"] as const).map(street => {
            const first = replay.frames.findIndex(f => f.street === street);
            return <Button size="small" key={street} disabled={first < 0} aria-pressed={frame.street === street}
              onClick={() => setIndex(first)}>{street === "complete" ? t("replay.result") : dictionary.feed[street]}</Button>;
          })}
        </nav>
        <div className={styles.table} data-replay-frame={index}>
          <div className={styles.board}>{Array.from({ length: 5 }, (_, i) => <PlayingCard key={i} card={frame.board[i]} />)}</div>
          <strong>{t("replay.pot")}: {formatChips(frame.pot, locale)}</strong>
          <div className={styles.players}>{frame.players.map(player => <article key={player.seat} className={`${styles.player} ${(awards.get(player.seat) ?? 0) > 0 ? seatStyles.winnerSeat : ""}`} data-replay-winner={(awards.get(player.seat) ?? 0) > 0} data-last-actor={frame.kind !== "result" && lastAction?.actorSeat === player.seat}>
            <strong className={styles.playerName}>{name(player.seat)}</strong>
            <SeatRoleBadge seat={player.seat} dealerSeat={replay.dealerSeat} smallBlindSeat={replay.smallBlindSeat} bigBlindSeat={replay.bigBlindSeat} />
            <div className={styles.cards}>{[0, 1].map(i => <PlayingCard key={i} card={player.cards?.[i]} hidden={!player.cards} />)}</div>
            {frame.kind !== "result" && player.bet > 0 ? <span className={`${seatStyles.actionBadge} ${styles.betBadge}`} data-replay-bet={player.bet}>
              {t("replay.bet")} {formatChips(player.bet, locale)}
            </span> : null}
            <span data-replay-stack>{t("replay.stack")}: {formatChips(player.stack, locale)}</span>
            <span className={styles.playerStatus}>{player.folded ? t("seat.folded") : player.allIn ? t("seat.allIn") : ""}</span>
            {(awards.get(player.seat) ?? 0) > 0 ? <span className={`${seatStyles.seatStatus} ${styles.award}`}
              data-replay-award aria-label={t("result.award", { player: name(player.seat), amount: formatChips(awards.get(player.seat) ?? 0, locale) })}
              title={replay.pots.flatMap((pot, i) => pot.awards.filter(award => award.seat === player.seat && award.amount > 0)
                .map(award => `${t("replay.pot")} ${i + 1}: ${formatChips(award.amount, locale)}`)).join(" · ")}>
              +{formatChips(awards.get(player.seat) ?? 0, locale)}
            </span> : null}
          </article>)}</div>
        </div>
        <div aria-live="polite" aria-atomic="true" className={styles.description}>
          <p><span className={styles.counter}>{t("replay.counter", { current: lastAction?.sequence ?? 0, total })}:</span>{" "}{frame.action ? dictionary.feed[frame.action.type].replace("{player}", name(frame.action.actorSeat)).replace("{amount}", frame.action.amount === null ? "" : formatChips(frame.action.amount, locale)) :
            t(frame.kind === "result" ? "replay.result" : frame.kind === "start" ? "replay.start" : "replay.runout")}</p>
        </div>
        <div className={styles.controls}><Button disabled={index === 0} onClick={() => move(-1)}>{t("replay.previous")}</Button>
          <Button disabled={index === replay.frames.length - 1} onClick={() => move(1)}>{t("replay.next")}</Button></div>
      </> : null}
      {onBack ? <Button onClick={onBack}>{t("replay.back")}</Button> : null}
    </div>
  </Modal>;
}
