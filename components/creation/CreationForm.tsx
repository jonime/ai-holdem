"use client";
import type { ReactNode } from "react";
import { Button } from "@/components/Button";
import { addLocalePrefix, type Locale } from "@/lib/i18n";
import { useCreation, type CreationLabels } from "./useCreation";
import { CreationFeedback } from "./CreationFeedback";
import styles from "./CreationForm.module.css";
export function CreationForm({ locale, labels, action, className, children, quickPlayLabel, createTableLabel }: { locale: Locale; labels: CreationLabels; action: string; className?: string; children?: ReactNode; quickPlayLabel?: string; createTableLabel?: string }) {
  const creation = useCreation(locale, labels);
  const inlineBusy = quickPlayLabel !== undefined;
  const canRetryInline = inlineBusy && creation.hasPending && !creation.terminal;
  const quickSelected = !createTableLabel || creation.mode === "quick";
  return <form method="post" action={action} aria-busy={creation.working} className={className} onSubmit={event => {
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
    const fieldset = form.querySelector("fieldset");
    if (fieldset) fieldset.disabled = true;
    void creation.begin({ mode: target.includes("/new-game") ? "custom" : "quick", settings: { ...(typeof name === "string" ? { hostName: name } : {}) } });
  }}>
    <fieldset disabled={creation.working || (creation.hasPending && !canRetryInline) || creation.wait > 0} style={{ display: "contents" }}>
      {children}
      {inlineBusy && <Button variant={createTableLabel ? "secondary" : "primary"} size={createTableLabel ? "medium" : "large"} type="submit"
        disabled={creation.hasPending && !quickSelected}
        className={`${createTableLabel ? styles.secondary : ""} ${creation.working && quickSelected ? styles.busy : ""}`}
        aria-busy={creation.working && quickSelected}>
        {canRetryInline && quickSelected && !creation.working ? labels.retry : quickPlayLabel}
      </Button>}
      {createTableLabel && <Button type="submit" formAction={addLocalePrefix("/new-game", locale)}
        disabled={creation.hasPending && creation.mode !== "custom"}
        className={`${styles.secondary} ${creation.working && creation.mode === "custom" ? styles.busy : ""}`}
        aria-busy={creation.working && creation.mode === "custom"}>
        {canRetryInline && creation.mode === "custom" && !creation.working ? labels.retry : createTableLabel}
      </Button>}
    </fieldset>
    {inlineBusy && <span className={styles.srOnly} role="status">{creation.working ? labels.creating : ""}</span>}
    <CreationFeedback creation={creation} labels={labels} hideWorkingMessage={inlineBusy} inlineRetry={canRetryInline} />
  </form>;
}
