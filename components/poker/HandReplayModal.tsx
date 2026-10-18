"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { api, HttpError } from "@/lib/http/api";
import { replayOutcomeSchema, type HandReplay } from "@/lib/http/replay-contracts";
import { ReplayViewer } from "./ReplayViewer";
import { ReplaySharing } from "./ReplaySharing";
import { Modal } from "./Modal";
import { useI18n } from "./I18nProvider";
import { Button } from "@/components/Button";
import { TurnCountdown } from "./TurnCountdown";
import type { Game } from "./types";
import styles from "./HandReplayModal.module.css";

export function HandReplayModal({ gameId, handNumber, game, yourTurn, onClose, onBack, restoreFocus, fallbackFocus }: {
  gameId: string; handNumber: number; game: Game | null; yourTurn: boolean;
  onClose: () => void; onBack?: () => void;
  restoreFocus: RefObject<HTMLElement | null>; fallbackFocus: RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);
  const shareRef = useRef<HTMLButtonElement>(null);
  const [sharing, setSharing] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [load, setLoad] = useState<{ status: "loading" | "unavailable" | "error" } | { status: "ready"; replay: HandReplay }>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
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
  return <Modal open title={t("replay.title")} onDismiss={onClose} initialFocus={closeRef}
    restoreFocus={restoreFocus} fallbackFocus={fallbackFocus} className={styles.dialog}>
    <div className={styles.content}>
      <header className={styles.controls}><h2>{t("replay.title")} · {t("feed.hand", { hand: handNumber })}</h2>
        <div className={styles.headerActions}>
          {yourTurn && game ? <span role="status" className={styles.turn}>{t("replay.yourTurn")} <TurnCountdown game={game} always /></span> : null}
          {replay && canShare ? <Button ref={shareRef} onClick={() => setSharing(true)}>{t("sharing.open")}</Button> : null}
          <Button ref={closeRef} onClick={onClose}>{t("replay.close")}</Button>
        </div></header>
      {load.status !== "ready" ? <p role="status">{t(load.status === "loading" ? "replay.loading" : load.status === "unavailable" ? "replay.unavailable" : "replay.error")}
        {load.status === "error" ? <Button onClick={() => { setLoad({ status: "loading" }); setAttempt(a => a + 1); }}>{t("replay.retry")}</Button> : null}</p> : null}
      {replay ? <>
        <ReplayViewer replay={replay} active={!sharing} />
        <ReplaySharing gameId={gameId} handNumber={handNumber} open={sharing} onAvailabilityChange={setCanShare} onClose={() => setSharing(false)} restoreFocus={shareRef} />
      </> : null}
      {onBack ? <Button onClick={onBack}>{t("replay.back")}</Button> : null}
    </div>
  </Modal>;
}
