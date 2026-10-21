"use client";
import { useEffect, useState } from "react";
import { GameErrorDetails } from "@/components/CopyErrorDetails";
import { captureDiagnostic, type DiagnosticReport } from "@/lib/http/diagnostics";
import { api, HttpError } from "@/lib/http/api";
import { shareTokenSchema, type ReplayData } from "@/lib/http/share-contracts";
import { useSettings } from "./useSettings";
import paletteStyles from "./PokerApp.module.css";
import { AmountDisplayProvider } from "./AmountDisplay";
import { ReplayViewer } from "./ReplayViewer";
import { useI18n } from "./I18nProvider";
import { Button } from "@/components/Button";
export function SharedReplay({ token }: { token: string }) {
  const { t } = useI18n();
  const settings = useSettings();
  const [load, setLoad] = useState<{ status: "loading" | "error" | "unavailable"; diagnostics?: DiagnosticReport } | { status: "ready"; replay: ReplayData }>({ status: shareTokenSchema.safeParse(token).success ? "loading" : "unavailable" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    if (!shareTokenSchema.safeParse(token).success) return;
    api.shares.read(token, { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setLoad({ status: "ready", replay: result.replay });
    }).catch(error => {
      if (!controller.signal.aborted) setLoad({ diagnostics: captureDiagnostic(error), status: error instanceof HttpError && error.status === 404 ? "unavailable" : "error" });
    });
    return () => controller.abort();
  }, [token, attempt]);
  return <AmountDisplayProvider value={{ mode: settings.preferences.amountDisplay }}><div className={paletteStyles.cardPalette} data-card-colours={settings.preferences.cardColours}>
    {load.status === "ready" ? <ReplayViewer replay={load.replay} active={load.status === "ready"} keyboardScope="page" /> : <p role="status">{t(load.status === "loading" ? "replay.loading" : load.status === "error" ? "replay.error" : "replay.unavailable")}</p>}
    {load.status === "error" ? <GameErrorDetails report={load.diagnostics ?? []} /> : null}
    {load.status === "error" ? <Button onClick={() => { setLoad({ status: "loading" }); setAttempt(a => a + 1); }}>{t("replay.retry")}</Button> : null}
  </div></AmountDisplayProvider>;
}
