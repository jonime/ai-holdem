"use client";
import { useAmounts, AmountText } from "./AmountDisplay";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReplayData } from "@/lib/http/share-contracts";
import { SeatRoleBadge } from "./SeatRoleBadge";
import { PlayingCard } from "./PlayingCard";
import { useI18n } from "./I18nProvider";
import { Button } from "@/components/Button";
import { cardLabel } from "./view-model";
import styles from "./HandReplayModal.module.css";
import seatStyles from "./Seat.module.css";
export function ReplayViewer({ replay, active = true, keyboardScope = "viewer" }: {
  replay: ReplayData; active?: boolean; keyboardScope?: "viewer" | "page";
}) {
  const { t, dictionary } = useI18n();
  const { format, spoken, mode } = useAmounts(replay.bigBlind ?? null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ replay, index: 0, previousIndex: -1 });
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const cancelTimer = useCallback(() => {
    generation.current++;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const pause = useCallback(() => { cancelTimer(); setPlaying(false); }, [cancelTimer]);
  // Reset during render so a replacement hand never renders the old position.
  if (position.replay !== replay) {
    setPosition({ replay, index: 0, previousIndex: -1 });
    setPlaying(false);
  }
  const { index, previousIndex } = position;
  const setIndex = useCallback((next: number | ((current: number) => number)) => {
    setPosition(current => {
      const index = typeof next === "function" ? next(current.index) : next;
      return index === current.index ? current : { ...current, index, previousIndex: current.index };
    });
  }, []);
  const frameCount = replay.frames.length ?? 0;
  const available = useCallback(() => {
    const root = contentRef.current;
    const top = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open]")).at(-1);
    return active && !document.hidden && !!root && (!top || top.contains(root));
  }, [active]);
  useLayoutEffect(() => {
    const suspend = () => { if (!available()) pause(); };
    suspend();
    document.addEventListener("visibilitychange", suspend);
    const observer = new MutationObserver(suspend);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", suspend); };
  }, [available, pause]);
  useLayoutEffect(() => {
    if (!playing || !available() || index >= frameCount - 1) return;
    const current = replay.frames[index];
    const previous = replay.frames[index - 1];
    const delay = index === 0 || current.board.some(card => !previous?.board.includes(card)) ? 2000 : 1200;
    const scheduled = generation.current;
    timer.current = setTimeout(() => {
      if (generation.current !== scheduled) return;
      timer.current = null;
      if (!available()) { pause(); return; }
      setIndex(index + 1);
      if (index + 1 === frameCount - 1) setPlaying(false);
    }, delay);
    return cancelTimer;
  }, [replay, index, frameCount, playing, available, cancelTimer, pause, setIndex]);
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
      pause();
      setIndex(current => Math.max(0, Math.min(frameCount - 1, current + delta)));
    };
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [frameCount, active, keyboardScope, setIndex, pause]);
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
    pause();
    // Keep standalone keyboard navigation within the viewer when a button disables.
    if (!contentRef.current?.closest("dialog")) contentRef.current?.focus({ preventScroll: true });
    setIndex(next);
  };
  const move = (delta: number) => select(Math.max(0, Math.min(replay.frames.length - 1, index + delta)));
  return <div ref={contentRef} tabIndex={-1} role="group" aria-label={t("replay.title")}>
      {mode === "bigBlinds" && replay.bigBlind === undefined ? <p>{t("amounts.fallback")}</p> : null}
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
          <strong>{t("replay.pot")}: <AmountText>{format(frame.pot)}</AmountText></strong>
          <div className={styles.players}>{frame.players.map(player => <article aria-label={name(player.seat)} data-replay-folded={player.folded} key={player.seat} className={`${styles.player} ${(awards.get(player.seat) ?? 0) > 0 ? seatStyles.winnerSeat : ""}`} data-replay-winner={(awards.get(player.seat) ?? 0) > 0} data-last-actor={frame.kind !== "result" && lastAction?.actorSeat === player.seat}>
            <strong className={styles.playerName}>{name(player.seat)}</strong>
            <SeatRoleBadge seat={player.seat} dealerSeat={replay.dealerSeat} smallBlindSeat={replay.smallBlindSeat} bigBlindSeat={replay.bigBlindSeat} />
            <div className={styles.cards}>{[0, 1].map(i => <PlayingCard key={i} card={player.cards?.[i]} hidden={!player.cards} />)}</div>
            {frame.kind !== "result" && player.bet > 0 ? <span className={`${seatStyles.actionBadge} ${styles.betBadge}`} data-replay-bet={player.bet}>
              {t("replay.bet")} <AmountText>{format(player.bet)}</AmountText>
            </span> : null}
            <span data-replay-stack>{t("replay.stack")}: <AmountText>{format(player.stack)}</AmountText></span>
            <span className={styles.playerStatus}>{player.folded ? t("seat.folded") : player.allIn ? t("seat.allIn") : ""}</span>
            {(awards.get(player.seat) ?? 0) > 0 ? <span className={`${seatStyles.seatStatus} ${styles.award}`}
              data-replay-award role="group" aria-label={t("result.award", { player: name(player.seat), amount: spoken(awards.get(player.seat) ?? 0) })}
              title={replay.pots.flatMap((pot, i) => pot.awards.filter(award => award.seat === player.seat && award.amount > 0)
                .map(award => `${t("replay.pot")} ${i + 1}: ${format(award.amount)}`)).join(" · ")}>
              +<AmountText>{format(awards.get(player.seat) ?? 0)}</AmountText>
            </span> : null}
          </article>)}</div>
        </div>
        <ReplayAnnouncement active={active} index={index} replay={replay} text={[
          t("accessibility.replayStep", { current: lastAction?.sequence ?? 0, total }),
          frame.action ? dictionary.feed[frame.action.type].replace("{player}", name(frame.action.actorSeat)).replace("{amount}", frame.action.amount === null ? "" : spoken(frame.action.amount)) : t(frame.kind === "result" ? "replay.result" : frame.kind === "start" ? "replay.start" : "replay.runout"),
          index === 0 || replay.frames[previousIndex]?.street !== frame.street ? frame.street === "complete" ? t("replay.result") : dictionary.feed[frame.street] : "",
          frame.board.filter(card => !replay.frames[previousIndex]?.board.includes(card)).map(card => cardLabel(card, dictionary.cards)).join(", "),
        ].filter(Boolean).join(". ")} />
        <div className={styles.description}>
          <p><span className={styles.counter}>{t("replay.counter", { current: lastAction?.sequence ?? 0, total })}:</span>{" "}<AmountText>{frame.action ? dictionary.feed[frame.action.type].replace("{player}", name(frame.action.actorSeat)).replace("{amount}", frame.action.amount === null ? "" : format(frame.action.amount)) :
            t(frame.kind === "result" ? "replay.result" : frame.kind === "start" ? "replay.start" : "replay.runout")}</AmountText></p>
        </div>
        <div className={`${styles.controls} ${styles.playback}`}><Button disabled={index === 0} onClick={() => move(-1)}>{t("replay.previous")}</Button>
          <Button onClick={() => {
            if (playing) { pause(); return; }
            if (!available()) return;
            if (index === frameCount - 1) setIndex(0);
            setPlaying(true);
          }}>{t(playing ? "replay.pause" : index === frameCount - 1 ? "replay.replay" : "replay.play")}</Button>
          <Button disabled={index === replay.frames.length - 1} onClick={() => move(1)}>{t("replay.next")}</Button></div>
      </> : null}
  </div>;
}

// A unit preference update must not create a new step announcement.
const ReplayAnnouncement = memo(function ReplayAnnouncement({ active, text }: {
  active: boolean; index: number; replay: ReplayData; text: string;
}) {
  return <div className="sr-only" aria-live={active ? "polite" : "off"} aria-atomic="true" data-replay-announcement>{text}</div>;
}, (before, after) => before.index === after.index && before.active === after.active && before.replay === after.replay);
