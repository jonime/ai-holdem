import { ActionHistory } from "@/components/poker/ActionHistory";
import type { AIDecision, HandHistory } from "@/components/poker/types";
import { useI18n } from "@/components/poker/I18nProvider";

export function HistoryModal({
  onClose,
  handNumber,
  history,
  availableHands,
  onSelectHand,
  liveDecisions,
}: {
  readonly onClose: () => void;
  readonly handNumber: number;
  readonly history: HandHistory | null;
  readonly availableHands: readonly number[];
  readonly onSelectHand: (handNumber: number) => void;
  readonly liveDecisions: readonly AIDecision[];
}) {
  const { t } = useI18n();
  return (
    <div
      className="history-modal"
      role="dialog"
      aria-modal="true"
      aria-label={t("history.actionHistory")}
    >
      <div className="history-backdrop" onClick={onClose} />
      <div className="history-dialog">
        <button
          type="button"
          className="history-close"
          onClick={onClose}
          aria-label={t("history.close")}
        >
          ×
        </button>
        <ActionHistory
          availableHands={availableHands}
          handNumber={handNumber}
          history={history}
          onSelectHand={onSelectHand}
          liveDecisions={liveDecisions}
        />
      </div>
    </div>
  );
}
