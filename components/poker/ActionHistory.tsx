import type { AIDecision, HandHistory } from "@/components/poker/types";
import { formatChips, parseProbabilities } from "@/components/poker/view-model";
import { useI18n } from "@/components/poker/I18nProvider";

function DecisionSummary({
  probabilities,
  confidence,
}: {
  readonly probabilities: Readonly<Record<string, number>>;
  readonly confidence: number;
}) {
  const { t } = useI18n();
  return (
    <div className="decision-summary">
      <div className="probability-list compact">
        {Object.entries(probabilities).map(([choice, probability]) => (
          <div className="probability" key={choice}>
            <span>{choice}</span>
            <div className="probability-track">
              <i style={{ width: `${probability * 100}%` }} />
            </div>
            <b>{Math.round(probability * 100)}%</b>
          </div>
        ))}
      </div>
      <span className="confidence-chip">
        {t("history.confidence", { percent: Math.round(confidence * 100) })}
      </span>
    </div>
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
      <section className="history-panel muted-panel">
        <p>{t("history.loadsWithTable")}</p>
      </section>
    );
  }

  const aiActionSequences = history.actions
    .filter((action) => action.controller === "typesafe_ai")
    .map((action) => action.sequence);
  const liveDecisionBySequence = new Map(
    aiActionSequences.map((sequence, index) => [
      sequence,
      liveDecisions[index],
    ]),
  );

  return (
    <section className="history-panel">
      <div className="panel-kicker">{t("history.persistedHand")}</div>
      <h2>{t("history.title")}</h2>
      <div className="hand-selector" aria-label={t("history.selectHand")}>
        {availableHands.map((availableHand) => (
          <button
            className={availableHand === handNumber ? "selected-hand" : ""}
            key={availableHand}
            onClick={() => onSelectHand(availableHand)}
          >
            {t("history.hand", { hand: availableHand })}
          </button>
        ))}
      </div>
      {history.actions.length === 0 ? (
        <p className="empty-history">{t("history.noActions")}</p>
      ) : (
        <ol className="history-list">
          {history.actions.map((action) => {
            const inspection =
              action.controller === "typesafe_ai"
                ? history.aiDecisions.find(
                    (decision) => decision.actionSequence === action.sequence,
                  )
                : undefined;
            const liveDecision =
              action.controller === "typesafe_ai" && !inspection
                ? liveDecisionBySequence.get(action.sequence)
                : undefined;
            const actionLabel = `${action.action}${action.amount !== null ? ` ${formatChips(action.amount, locale)}` : ""}`;

            return (
              <li
                key={action.sequence}
                className={
                  action.controller === "typesafe_ai" ? "ai-history" : ""
                }
              >
                <span>{action.player}</span>
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
                    <details className="history-inspection">
                      <summary>{t("history.rawDecision")}</summary>
                      <div className="inspection-entry">
                        <pre>
                          {JSON.stringify(
                            {
                              state: inspection.state,
                              legalActions: inspection.legalActions,
                              probabilities: inspection.probabilities,
                              rawResponse: inspection.rawResponse,
                            },
                            null,
                            2,
                          )}
                        </pre>
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
