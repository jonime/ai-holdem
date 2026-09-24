import { useState } from "react";

import type { AIDecision, HandHistory } from "@/components/poker/types";
import { formatChips, parseProbabilities } from "@/components/poker/view-model";
import { useI18n } from "@/components/poker/I18nProvider";
import styles from "@/components/poker/ActionHistory.module.css";

function DecisionSummary({
  probabilities,
  confidence,
}: {
  readonly probabilities: Readonly<Record<string, number>> | null;
  readonly confidence: number | null;
}) {
  const { t } = useI18n();
  return (
    <div className={styles.decisionSummary}>
      <div className={`${styles.probabilityList} ${styles.compact}`}>
        {Object.entries(probabilities ?? {}).map(([choice, probability]) => (
          <div className={styles.probability} key={choice}>
            <span>{choice}</span>
            <div className={styles.probabilityTrack}>
              <i style={{ width: `${probability * 100}%` }} />
            </div>
            <b>{Math.round(probability * 100)}%</b>
          </div>
        ))}
      </div>
      {confidence !== null ? (
        <span className={styles.confidenceChip}>
          {t("history.confidence", { percent: Math.round(confidence * 100) })}
        </span>
      ) : null}
    </div>
  );
}

function CopyRawDecisionButton({ value }: { readonly value: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const copyDecision = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      className={styles.copyButton}
      aria-label={t(copied ? "history.copied" : "history.copyRawDecision")}
      onClick={() => void copyDecision()}
    >
      {t(copied ? "history.copied" : "history.copyRawDecision")}
    </button>
  );
}

export function ActionHistory({
  history,
  handNumber,
  availableHands,
  onSelectHand,
  liveDecisions,
}: {
  readonly history: HandHistory | null;
  readonly handNumber: number;
  readonly availableHands: readonly number[];
  readonly onSelectHand: (handNumber: number) => void;
  readonly liveDecisions: readonly AIDecision[];
}) {
  const { locale, t } = useI18n();
  if (!history) {
    return (
      <section className={`${styles.historyPanel} ${styles.mutedPanel}`}>
        <p>{t("history.loadsWithTable")}</p>
      </section>
    );
  }

  const aiActionSequences = history.actions
    .filter((action) => action.controller === "bot")
    .map((action) => action.sequence);
  const liveDecisionBySequence = new Map(
    aiActionSequences.map((sequence, index) => [
      sequence,
      liveDecisions[index],
    ]),
  );

  return (
    <section className={styles.historyPanel}>
      <div className={styles.panelKicker}>{t("history.persistedHand")}</div>
      <h2>{t("history.title")}</h2>
      <div className={styles.handSelector} aria-label={t("history.selectHand")}>
        {availableHands.map((availableHand) => (
          <button
            className={availableHand === handNumber ? styles.selectedHand : ""}
            key={availableHand}
            onClick={() => onSelectHand(availableHand)}
          >
            {t("history.hand", { hand: availableHand })}
          </button>
        ))}
      </div>
      {history.actions.length === 0 ? (
        <p className={styles.emptyHistory}>{t("history.noActions")}</p>
      ) : (
        <ol className={styles.historyList}>
          {history.actions.map((action) => {
            const inspection =
              action.controller === "bot"
                ? history.aiDecisions.find(
                    (decision) => decision.actionSequence === action.sequence,
                  )
                : undefined;
            const liveDecision =
              action.controller === "bot" && !inspection
                ? liveDecisionBySequence.get(action.sequence)
                : undefined;
            const actionLabel = `${action.action}${action.amount !== null ? ` ${formatChips(action.amount, locale)}` : ""}`;
            const rawDecision = inspection
              ? JSON.stringify(
                  {
                    state: inspection.state,
                    legalActions: inspection.legalActions,
                    probabilities: inspection.probabilities,
                    rawResponse: inspection.rawResponse,
                  },
                  null,
                  2,
                )
              : null;

            return (
              <li
                key={action.sequence}
                className={action.controller === "bot" ? styles.aiHistory : ""}
              >
                <span>{action.player}</span>
                {action.bot ? <small>{action.bot.label}</small> : null}
                <b>{actionLabel}</b>
                <small>{action.street}</small>
                {inspection ? (
                  <>
                    <DecisionSummary
                      probabilities={parseProbabilities(
                        inspection.probabilities,
                      )}
                      confidence={inspection.confidence}
                    />
                    <details className={styles.historyInspection}>
                      <summary>{t("history.rawDecision")}</summary>
                      <div className={styles.inspectionEntry}>
                        {rawDecision ? (
                          <>
                            <CopyRawDecisionButton value={rawDecision} />
                            <pre>{rawDecision}</pre>
                          </>
                        ) : null}
                      </div>
                    </details>
                  </>
                ) : liveDecision ? (
                  <DecisionSummary
                    probabilities={parseProbabilities(
                      liveDecision.probabilities,
                    )}
                    confidence={liveDecision.confidence}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
