"use client";
import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import { useCreation, type CreationLabels } from "./useCreation";
import { CreationFeedback } from "./CreationFeedback";
export function CreationForm({ locale, labels, action, className, children }: { locale: Locale; labels: CreationLabels; action: string; className?: string; children: ReactNode }) {
  const creation = useCreation(locale, labels);
  return <form method="post" action={action} className={className} onSubmit={event => {
    if (!creation.ready) return;
    event.preventDefault();
    if (creation.working || creation.hasPending) return;
    const form = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const target = submitter instanceof HTMLButtonElement && submitter.getAttribute("formaction") || action;
    const data = new FormData(form);
    const name = data.get("hostName");
    // Disable synchronously before hashing, storage, or the first network await.
    form.querySelectorAll<HTMLButtonElement>('button[type="submit"]').forEach(button => { button.disabled = true; });
    void creation.begin({ mode: target.includes("/new-game") ? "custom" : "quick", settings: { ...(typeof name === "string" ? { hostName: name } : {}) } }).finally(() => { form.querySelectorAll<HTMLButtonElement>('button[type="submit"]').forEach(button => { button.disabled = false; }); });
  }}>
    <fieldset disabled={creation.working || creation.hasPending} style={{ display: "contents" }}>{children}</fieldset>
    <CreationFeedback creation={creation} labels={labels} />
  </form>;
}
