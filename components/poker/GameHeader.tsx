"use client";

import { useRouter } from "next/navigation";

import { useI18n } from "@/components/poker/I18nProvider";
import styles from "@/components/poker/GameHeader.module.css";
import { APP_NAME } from "@/lib/constants";

export function GameHeader() {
  const router = useRouter();
  const { locale, t } = useI18n();

  function handleExit() {
    if (window.confirm(t("gameHeader.confirmExit"))) {
      router.push(`/${locale}`);
    }
  }

  return (
    <header className={styles.gameHeader}>
      <div className={styles.gameHeaderInner}>
        <span className={styles.gameHeaderTitle}>{APP_NAME}</span>
        <button className={styles.exitGame} type="button" onClick={handleExit}>
          {t("gameHeader.exit")}
        </button>
      </div>
    </header>
  );
}
