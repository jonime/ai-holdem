"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { FiRefreshCw } from "react-icons/fi";
import { api } from "@/lib/http/api";
import { captureDiagnostic, type DiagnosticReport } from "@/lib/http/diagnostics";
import type { PersonalResults } from "@/lib/http/results-contracts";
import { GameErrorDetails } from "@/components/CopyErrorDetails";
import { Button } from "@/components/Button";
import { formatResultAmount } from "./personal-results-format";
import { Modal } from "./Modal";
import { useI18n } from "./I18nProvider";
import { useAmounts, AmountText } from "./AmountDisplay";
import { TurnCountdown } from "./TurnCountdown";
import type { Game } from "./types";
import styles from "./PersonalResultsModal.module.css";

type Load = { status: "loading" } | { status: "error"; diagnostics: DiagnosticReport } | { status: "ready"; results: PersonalResults };
export function PersonalResultsModal({ gameId, game, yourTurn, active, onClose, onReview, restoreFocus, fallbackFocus }: {
  gameId: string; game: Game | null; yourTurn: boolean; active: boolean;
  onClose: () => void; onReview: (hand: number, opener: HTMLButtonElement) => void;
  restoreFocus: RefObject<HTMLElement | null>; fallbackFocus: RefObject<HTMLElement | null>;
}) {
  const { t, locale } = useI18n();
  const { mode } = useAmounts();
  const closeRef = useRef<HTMLButtonElement>(null);
  const initialFocus = useRef<HTMLElement | null>(null);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api.games.results({ gameId }, { signal: controller.signal }).then(({ results }) => {
      if (!controller.signal.aborted) setLoad({ status: "ready", results });
    }).catch(error => {
      if (!controller.signal.aborted) setLoad({ status: "error", diagnostics: captureDiagnostic(error) });
    });
    return () => controller.abort();
  }, [gameId, attempt]);
  const refresh = () => { initialFocus.current = closeRef.current; closeRef.current?.focus({ preventScroll: true }); setLoad({ status: "loading" }); setAttempt(n => n + 1); };
  const results = load.status === "ready" ? load.results : null;
  const completedHand = game ? game.poker.handNumber - (game.poker.street === "complete" ? 0 : 1) : 0;
  const format = (chips: number, bb: number) => formatResultAmount(chips, bb, mode, locale, t("amounts.chips"));
  return <Modal open={active} title={t("results.title")} onDismiss={onClose}
    initialFocus={initialFocus} restoreFocus={restoreFocus} fallbackFocus={fallbackFocus} className={styles.dialog}>
    <div className={styles.content}>
      <header className={styles.header}><h2>{t("results.title")}</h2>
        {yourTurn && game ? <span className={styles.turn} data-results-turn-warning>{t("replay.yourTurn")} <TurnCountdown game={game} always /></span> : null}
        <div className={styles.headerActions}>
          <Button variant="icon" className={styles.refresh} onClick={refresh} disabled={load.status === "loading"}
            aria-label={t("results.refresh")} title={t("results.refresh")}>
            <FiRefreshCw aria-hidden="true" />
          </Button>
          <Button ref={element => { closeRef.current = element; if (!initialFocus.current) initialFocus.current = element; }} onClick={onClose}>{t("replay.close")}</Button>
        </div></header>
      {load.status === "loading" ? <p role="status">{t("results.loading")}</p> : null}
      {load.status === "error" ? <><p role="alert">{t("results.error")}</p><Button onClick={refresh}>{t("replay.retry")}</Button><GameErrorDetails report={load.diagnostics} /></> : null}
      {results ? <>
        {results.incomplete ? <div className={styles.notice} role="status"><p>{t("results.incomplete", { count: results.excludedHands })}</p>
          {results.ownershipIncomplete ? <p>{t("results.ownershipIncomplete")}</p> : null}</div> : null}
        {results.availableHands === 0 ? <><p>{t(results.incomplete ? "results.noAvailable" : "results.empty")}</p>
          {results.handsPlayed > 0 ? <p>{t("results.hands")}: {new Intl.NumberFormat(locale).format(results.handsPlayed)}</p> : null}</> : <>
          <dl className={styles.summary}>
            <div><dt>{t("results.hands")}</dt><dd>{new Intl.NumberFormat(locale).format(results.handsPlayed)}</dd></div>
            <div className={styles.net}><dt>{t(results.incomplete ? "results.availableNet" : "results.net")}</dt><dd><AmountText>{results.netChips !== null && results.netBB !== null ? format(results.netChips, results.netBB) : t("results.noAvailable")}</AmountText></dd></div>
          </dl>
          <div className={styles.highlights}>
            {(["biggestWin", "biggestLoss"] as const).map(key => {
              const hand = results[key];
              return <section key={key} data-result-highlight={key}><h3>{t(`results.${key}`)}</h3>
                {hand ? <><p className={styles.handNumber}>{t("feed.hand", { hand: hand.handNumber })}</p>
                  <p className={styles.highlightAmount}><AmountText>{format(hand.netChips, hand.netBB)}</AmountText></p>
                  <Button size="small" className={styles.review} onClick={event => { initialFocus.current = event.currentTarget; onReview(hand.handNumber, event.currentTarget); }}>
                    {t("replay.review")}</Button></> : <p className={styles.emptyHighlight}>{t(key === "biggestWin" ? "results.noWin" : "results.noLoss")}</p>}
              </section>;
            })}
          </div>
        </>}
        {completedHand > results.throughHand ? <p className={styles.notice} role="status">{t("results.newHands")}</p> : null}
      </> : null}
    </div>
  </Modal>;
}
