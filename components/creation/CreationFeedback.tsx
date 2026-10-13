"use client";
import type { useCreation, CreationLabels } from "./useCreation";
export function CreationFeedback({ creation, labels }: { creation: ReturnType<typeof useCreation>; labels: CreationLabels }) {
  return <div aria-live="polite">
    {creation.message && <p role="status">{creation.message}</p>}
    {creation.wait > 0 && <p>{labels.wait.replace("{seconds}", String(Math.ceil(creation.wait / 1000)))}</p>}
    {creation.memoryOnly && <p>{labels.memoryOnly}</p>}
    {creation.hasPending && !creation.terminal && <button type="button" disabled={creation.working || creation.wait > 0} onClick={() => void creation.retry()}>{labels.retry}</button>}
    {creation.terminal && <button type="button" onClick={creation.discard}>{labels.dismiss}</button>}
  </div>;
}
