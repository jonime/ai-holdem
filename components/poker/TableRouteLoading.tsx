"use client";

import { addLocalePrefix } from "@/lib/i18n";
import { useI18n } from "./I18nProvider";
import { TableLoadingShell } from "./TableLoadingShell";

/** Segment-local fallback: shared parent layouts can be reused during navigation. */
export function TableRouteLoading() {
  const { locale, t } = useI18n();
  return <TableLoadingShell label={t("table.loading")} homeHref={addLocalePrefix("/", locale)}
    controlLabels={[t("gameHeader.help"), t("settings.title"), t("gameHeader.lobby")]} />;
}
