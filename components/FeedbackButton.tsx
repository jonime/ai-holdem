"use client";

import { useEffect, type ComponentProps } from "react";
import { Button } from "./Button";
import styles from "./FeedbackButton.module.css";

/** Reserves space for both labels and clears temporary feedback after a delay. */
export function FeedbackButton({ children, feedback, feedbackLabel, onFeedbackEnd, feedbackDurationMs = 2000, ...props }: Omit<ComponentProps<typeof Button>, "children"> & {
  readonly children: string;
  readonly feedback: boolean;
  readonly feedbackLabel: string;
  readonly onFeedbackEnd: () => void;
  readonly feedbackDurationMs?: number;
}) {
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(onFeedbackEnd, feedbackDurationMs);
    return () => clearTimeout(timer);
  }, [feedback, feedbackDurationMs, onFeedbackEnd]);

  return <Button {...props}>
    <span className={styles.labels} aria-live="polite" aria-atomic="true">
      <span className={!feedback ? styles.active : undefined} aria-hidden={feedback}>{children}</span>
      <span className={feedback ? styles.active : undefined} aria-hidden={!feedback}>{feedbackLabel}</span>
    </span>
  </Button>;
}
