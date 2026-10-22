"use client";

import { createContext, useContext, type HTMLAttributes, type ReactNode } from "react";
import { useI18n } from "./I18nProvider";
import { TurnCountdown } from "./TurnCountdown";
import type { Game } from "./types";
import styles from "./ModalTurnWarning.module.css";

const ModalTurnContext = createContext<{ readonly game: Game; readonly label: string } | null>(null);

/** The game shell owns live turn eligibility; dialogs only display it. */
export function ModalTurnProvider({ game, yourTurn, children }: {
  readonly game: Game | null;
  readonly yourTurn: boolean;
  readonly children: ReactNode;
}) {
  const { t } = useI18n();
  return <ModalTurnContext.Provider value={yourTurn && game ? { game, label: t("replay.yourTurn") } : null}>{children}</ModalTurnContext.Provider>;
}

export function ModalTurnWarning({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  const turn = useContext(ModalTurnContext);
  if (!turn) return null;
  return <span {...props} data-modal-turn-warning className={`${styles.warning} ${className ?? ""}`}>
    {turn.label} <TurnCountdown game={turn.game} always />
  </span>;
}
