"use client";
import { CopyErrorDetails } from "@/components/CopyErrorDetails";
import { Button } from "@/components/Button";
import type { useCreation, CreationLabels } from "./useCreation";
import styles from "./CreationFeedback.module.css";
export function CreationFeedback({ creation, labels, hideWorkingMessage = false, inlineRetry = false }: { creation: ReturnType<typeof useCreation>; labels: CreationLabels; hideWorkingMessage?: boolean; inlineRetry?: boolean }) {
  return <div className={styles.feedback} aria-live="polite">
    {creation.message && !inlineRetry && !(hideWorkingMessage && creation.message === labels.creating) && <p role="status">{creation.message}</p>}
    {creation.message && !creation.working ? <CopyErrorDetails report={creation.diagnostics} labels={labels} /> : null}
    {creation.wait > 0 && <p>{labels.wait.replace("{seconds}", String(Math.ceil(creation.wait / 1000)))}</p>}
    {creation.memoryOnly && <p>{labels.memoryOnly}</p>}
    {creation.hasPending && !creation.terminal && !creation.working && !inlineRetry && <Button disabled={creation.wait > 0} onClick={() => void creation.retry()}>{labels.retry}</Button>}
    {creation.terminal && !creation.working && <Button onClick={creation.discard}>{labels.dismiss}</Button>}
  </div>;
}
