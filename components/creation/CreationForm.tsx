"use client";
import type { ReactNode } from "react";
import { Button } from "@/components/Button";
import type { Locale } from "@/lib/i18n";
import { useCreation, type CreationLabels } from "./useCreation";
import { CreationFeedback } from "./CreationFeedback";
import styles from "./CreationForm.module.css";
export function CreationForm({ locale, labels, action, className, children, quickPlayLabel }: { locale: Locale; labels: CreationLabels; action: string; className?: string; children?: ReactNode; quickPlayLabel?: string }) {
  const creation = useCreation(locale, labels);
  const inlineBusy = quickPlayLabel !== undefined;
  const canRetryInline = inlineBusy && creation.hasPending && !creation.terminal;
  return <form method="post" action={action} aria-busy={creation.working} className={`${className ?? ""} ${inlineBusy && creation.working ? styles.busy : ""}`} onSubmit={event => {
    if (!creation.ready) return;
    event.preventDefault();
    if (creation.working) return;
    if (creation.hasPending) {
      if (canRetryInline) void creation.retry();
      return;
    }
    const form = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const target = submitter instanceof HTMLButtonElement && submitter.getAttribute("formaction") || action;
    const data = new FormData(form);
    const name = data.get("hostName");
    // Disable synchronously before hashing, storage, or the first network await.
    form.querySelectorAll<HTMLButtonElement>('button[type="submit"]').forEach(button => { button.disabled = true; });
    void creation.begin({ mode: target.includes("/new-game") ? "custom" : "quick", settings: { ...(typeof name === "string" ? { hostName: name } : {}) } }).finally(() => { form.querySelectorAll<HTMLButtonElement>('button[type="submit"]').forEach(button => { button.disabled = false; }); });
  }}>
    <fieldset disabled={creation.working || (creation.hasPending && !canRetryInline) || creation.wait > 0} style={{ display: "contents" }}>
      {inlineBusy ? <Button variant="primary" size="large" type="submit" aria-busy={creation.working}>
        {canRetryInline && !creation.working ? labels.retry : quickPlayLabel}
      </Button> : children}
    </fieldset>
    {inlineBusy && <span className={styles.srOnly} role="status">{creation.working ? labels.creating : ""}</span>}
    <CreationFeedback creation={creation} labels={labels} hideWorkingMessage={inlineBusy} inlineRetry={canRetryInline} />
  </form>;
}
