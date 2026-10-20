"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { formatDiagnostics, type DiagnosticReport } from "@/lib/http/diagnostics";
import type { GameDictionary } from "@/lib/i18n/types";
import { useI18n } from "./poker/I18nProvider";
import styles from "./CopyErrorDetails.module.css";
type Labels = Pick<GameDictionary["creation"], "copyDetails" | "copySuccess" | "copyFallback">;
export function CopyErrorDetails({ report, labels }: { report: DiagnosticReport; labels: Labels }) {
  const text = formatDiagnostics(report ?? []);
  return text ? <CopyDetails key={text} text={text} labels={labels} /> : null;
}
function CopyDetails({ text, labels }: { text: string; labels: Labels }) {
  const [state, setState] = useState<"idle" | "copying" | "copied" | "fallback">("idle");
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function copy() {
    setState("copying");
    try { await navigator.clipboard.writeText(text); if (active.current) setState("copied"); }
    catch { if (active.current) setState("fallback"); }
  }
  return <span className={styles.details}>
    <Button size="small" disabled={state === "copying"} onClick={() => void copy()}>{labels.copyDetails}</Button>
    {state === "copied" ? <span role="status">{labels.copySuccess}</span> : null}
    {state === "fallback" ? <label className={styles.fallback}>{labels.copyFallback}<textarea readOnly rows={9} value={text} onFocus={event => event.currentTarget.select()} /></label> : null}
  </span>;
}
export function GameErrorDetails({ report }: { report: DiagnosticReport }) {
  return report?.length ? <TranslatedDetails report={report} /> : null;
}
function TranslatedDetails({ report }: { report: DiagnosticReport }) {
  const { dictionary } = useI18n();
  return <CopyErrorDetails report={report} labels={dictionary.creation} />;
}
