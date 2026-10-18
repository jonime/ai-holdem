"use client";
import { useEffect, useRef, useState } from "react";
import type { ReplayData } from "@/lib/http/share-contracts";
import { SeatRoleBadge } from "./SeatRoleBadge";
import { PlayingCard } from "./PlayingCard";
import { useI18n } from "./I18nProvider";
import { Button } from "@/components/Button";
import { formatChips } from "./view-model";
import styles from "./HandReplayModal.module.css";
import seatStyles from "./Seat.module.css";
export function ReplayViewer({ replay, active = true, keyboardScope = "viewer" }: {
  replay: ReplayData; active?: boolean; keyboardScope?: "viewer" | "page";
}) {
  const { t, dictionary, locale } = useI18n();
  const contentRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const frameCount = replay.frames.length ?? 0;
  // Native dialogs may lose button focus when a boundary disables that button.
  // Standalone pages also accept neutral body focus before the first interaction.
  useEffect(() => {
    if (!active || frameCount === 0) return;
    const root = contentRef.current;
    if (!root) return;
    const dialog = root.closest("dialog");
    const navigate = (event: KeyboardEvent) => {
      const target = event.target;
      const inScope = dialog ? dialog.open && dialog.matches(":modal") :
        !document.querySelector("dialog[open]") && (root.contains(target as Node) ||
          keyboardScope === "page" && target === document.body);
      if (!inScope || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey ||
          !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select"))) return;
      event.preventDefault();
      event.stopPropagation();
      if (!dialog) root.focus({ preventScroll: true });
      const delta = event.key === "ArrowLeft" ? -1 : 1;
      setIndex(current => Math.max(0, Math.min(frameCount - 1, current + delta)));
    };
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [frameCount, active, keyboardScope]);
  const frame = replay.frames[index];
  const name = (seat: number) => replay.participants.find(p => p.seat === seat)?.name ?? "";
  const lastAction = replay.frames.slice(0, index + 1).findLast(f => f.action)?.action;
  const total = replay.frames.filter(f => f.action).length ?? 0;
  const awards = new Map<number, number>();
  if (frame?.kind === "result") {
    for (const pot of replay.pots ?? []) for (const award of pot.awards) {
      awards.set(award.seat, (awards.get(award.seat) ?? 0) + award.amount);
    }
  }
  const select = (next: number) => {
    // Keep standalone keyboard navigation within the viewer when a button disables.
    if (!contentRef.current?.closest("dialog")) contentRef.current?.focus({ preventScroll: true });
    setIndex(next);
  };
  const move = (delta: number) => select(Math.max(0, Math.min(replay.frames.length - 1, index + delta)));
  return <div ref={contentRef} tabIndex={0} aria-label={t("replay.title")}>
      {frame ? <>
        <nav className={`${styles.controls} ${styles.streets}`} aria-label={t("replay.title")}>
          {(["preflop", "flop", "turn", "river", "complete"] as const).map(street => {
            const first = replay.frames.findIndex(f => f.street === street);
            return <Button size="small" key={street} disabled={first < 0} aria-pressed={frame.street === street}
              onClick={() => select(first)}>{street === "complete" ? t("replay.result") : dictionary.feed[street]}</Button>;
          })}
        </nav>
        <div className={styles.table} data-replay-frame={index}>
          <div className={styles.board}>{Array.from({ length: 5 }, (_, i) => <PlayingCard key={i} card={frame.board[i]} />)}</div>
          <strong>{t("replay.pot")}: {formatChips(frame.pot, locale)}</strong>
          <div className={styles.players}>{frame.players.map(player => <article data-replay-folded={player.folded} key={player.seat} className={`${styles.player} ${(awards.get(player.seat) ?? 0) > 0 ? seatStyles.winnerSeat : ""}`} data-replay-winner={(awards.get(player.seat) ?? 0) > 0} data-last-actor={frame.kind !== "result" && lastAction?.actorSeat === player.seat}>
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
  </div>;
}
