import { ActionHistory } from "@/components/poker/ActionHistory";
import type { AIDecision, HandHistory } from "@/components/poker/types";
import { useI18n } from "@/components/poker/I18nProvider";
import styles from "@/components/poker/HistoryModal.module.css";

export function HistoryModal({
  onClose,
  handNumber,
  history,
  loading,
  availableHands,
  onSelectHand,
  liveDecisions,
}: {
  readonly onClose: () => void;
  readonly handNumber: number;
  readonly history: HandHistory | null;
  readonly loading: boolean;
  readonly availableHands: readonly number[];
  readonly onSelectHand: (handNumber: number) => void;
  readonly liveDecisions: readonly AIDecision[];
}) {
  const { t } = useI18n();
  return (
    <div
      className={styles.historyModal}
      role="dialog"
      aria-modal="true"
      aria-label={t("history.actionHistory")}
    >
      <div className={styles.historyBackdrop} onClick={onClose} />
      <div className={styles.historyDialog}>
        <button
          type="button"
          className={styles.historyClose}
          onClick={onClose}
          aria-label={t("history.close")}
        >
          ×
        </button>
        <ActionHistory
          availableHands={availableHands}
          handNumber={handNumber}
          history={history}
          loading={loading}
          onSelectHand={onSelectHand}
          liveDecisions={liveDecisions}
        />
      </div>
    </div>
  );
}
