"use client";

import { useRouter } from "next/navigation";

import { useI18n } from "@/components/poker/I18nProvider";
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
    <header className="game-header">
      <div className="game-header-inner">
        <span className="game-header-title">{APP_NAME}</span>
        <button className="exit-game" type="button" onClick={handleExit}>
          {t("gameHeader.exit")}
        </button>
      </div>
    </header>
  );
}
