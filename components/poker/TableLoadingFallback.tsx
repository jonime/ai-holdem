"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useTransition } from "react";

import { addLocalePrefix } from "@/lib/i18n";
import { useI18n } from "./I18nProvider";
import styles from "./TableLoadingFallback.module.css";

function TableLoadingPanel({ failure, pending = false, onRetry }: {
  readonly failure: "missing" | "error";
  readonly pending?: boolean;
  readonly onRetry?: () => void;
}) {
  const { locale, t } = useI18n();
  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="table-loading-title">
        <Image
          className={styles.icon}
          src="/ai-holdem-logo.png"
          alt=""
          width={200}
          height={200}
          sizes="200px"
          loading="eager"
        />
        <p className={styles.brand}>AI Hold’em</p>
        <h1 id="table-loading-title">{t(failure === "missing" ? "tableLoading.missingTitle" : "tableLoading.errorTitle")}</h1>
        <p className={styles.guidance}>{t(failure === "missing" ? "tableLoading.missingGuidance" : "tableLoading.errorGuidance")}</p>
        <div className={styles.actions}>
          {onRetry && <button className={styles.primary} type="button" disabled={pending} aria-busy={pending} onClick={onRetry}>{t("tableLoading.retry")}</button>}
          <Link className={onRetry ? styles.secondary : styles.primary} href={addLocalePrefix("/play", locale)}>{t("gameHeader.lobby")}</Link>
        </div>
      </section>
    </main>
  );
}

export function MissingTable() {
  return <TableLoadingPanel failure="missing" />;
}

export function TableLoadingError({ retry }: {
  readonly error: Error & { digest?: string };
  readonly retry: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const retrying = useRef(false);
  function tryAgain() {
    if (pending || retrying.current) return;
    retrying.current = true;
    startTransition(async () => {
      try {
        // Next's boundary retry refetches the current segment and preserves its URL/cookies.
        await retry();
      } finally {
        retrying.current = false;
      }
    });
  }
  return <TableLoadingPanel failure="error" pending={pending} onRetry={tryAgain} />;
}
