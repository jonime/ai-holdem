"use client";
import { useEffect, useRef, useState } from "react";
import { api, HttpError } from "@/lib/http/api";
import { withDeadline } from "@/lib/http/deadline";
import { addLocalePrefix, type Locale } from "@/lib/i18n";
import type { GameDictionary } from "@/lib/i18n/types";
import { attemptSchema, attemptStorageKey, CookiesRequired, identityFingerprint, type Attempt, type Intent } from "./attempt";
import { captureDiagnostic, type DiagnosticReport } from "@/lib/http/diagnostics";
export type CreationLabels = GameDictionary["creation"];
export function useCreation(locale: Locale, labels: CreationLabels) {
  const pending = useRef<Attempt | null>(null);
  const busy = useRef(false);
  const generation = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const [ready, setReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const [mode, setMode] = useState<Intent["mode"] | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticReport>([]);
  const [message, setMessage] = useState("");
  const [memoryOnly, setMemoryOnly] = useState(false);
  const [terminal, setTerminal] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (!retryAt) return;
    const timer = setInterval(() => setWait(Math.max(0, retryAt - Date.now())), 250);
    return () => clearInterval(timer);
  }, [retryAt]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
    if (!active) return;
    try {
      const stored = sessionStorage.getItem(attemptStorageKey);
      if (stored) {
        let raw: unknown;
        try { raw = JSON.parse(stored); } catch { raw = null; }
        const parsed = attemptSchema.safeParse(raw);
        if (parsed.success) { pending.current = parsed.data; setMode(parsed.data.intent.mode); setHasPending(true); setMessage(labels.recovery); }
        else { setTerminal(true); setHasPending(true); setMessage(labels.unavailable); }
      }
      sessionStorage.setItem(`${attemptStorageKey}-probe`, "1");
      sessionStorage.removeItem(`${attemptStorageKey}-probe`);
    } catch { setMemoryOnly(true); }
    setReady(true);
    });
    return () => { active = false;
      // This counter fences async requests, rather than referring to a DOM node.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++; abort.current?.abort(); busy.current = false; };
  }, [labels.recovery, labels.unavailable]);
  const persist = (attempt: Attempt | null) => {
    try { if (attempt) sessionStorage.setItem(attemptStorageKey, JSON.stringify(attempt)); else sessionStorage.removeItem(attemptStorageKey); }
    catch { setMemoryOnly(true); }
  };
  const run = async (intent?: Intent) => {
    if (!ready || busy.current || terminal || Date.now() < retryAt || (intent && hasPending)) return;
    busy.current = true; setDiagnostics([]); setWorking(true); setMessage(labels.creating);
    setMode(pending.current?.intent.mode ?? intent?.mode ?? null);
    const current = generation.current;
    const controller = new AbortController(); abort.current = controller;
    try {
      let owner: string;
      try { owner = await identityFingerprint(!pending.current); }
      catch (error) {
        if (pending.current && error instanceof CookiesRequired) { setTerminal(true); setMessage(labels.identityChanged); return; }
        throw error;
      }
      if (current !== generation.current) return;
      if (pending.current && pending.current.owner !== owner) {
        setTerminal(true); setMessage(labels.identityChanged); return;
      }
      if (!pending.current) {
        if (!intent) return;
        pending.current = { version: 1, id: crypto.randomUUID(), owner, intent };
        persist(pending.current); setHasPending(true);
      }
      const attempt = pending.current;
      // Re-read immediately before sending, including after async fingerprinting.
      if (await identityFingerprint() !== attempt.owner) { setTerminal(true); setMessage(labels.identityChanged); return; }
      if (current !== generation.current) return;
      const body = await withDeadline(signal => attempt.intent.mode === "custom"
        ? api.creation.custom({ ...attempt.intent.settings, creationAttemptId: attempt.id }, { signal })
        : api.creation.quickPlay({ lang: locale, botMode: attempt.intent.botMode, hostName: attempt.intent.settings.hostName, creationAttemptId: attempt.id }, { signal }), 15_000, controller.signal);
      if (current !== generation.current) return;
      persist(null); pending.current = null; setHasPending(false);
      window.location.assign(addLocalePrefix(`/game/${body.gameId}`, locale));
    } catch (error) {
      if (current !== generation.current) return;
      if (error instanceof CookiesRequired) setMessage(labels.cookiesRequired);
      else if (error instanceof HttpError && ["CREATION_ATTEMPT_CONFLICT", "CREATION_ATTEMPT_UNAVAILABLE"].includes(error.code ?? "")) { setTerminal(true); setMessage(labels.unavailable); }
      else if (error instanceof HttpError && error.code === "GAME_CREATION_LIMIT") {
        const delay = error.retryAfterMs ?? 0;
        setRetryAt(Date.now() + delay); setWait(delay); setMessage(labels.denied);
      }
      else { setMessage(labels.failed); setDiagnostics(captureDiagnostic(error, pending.current?.intent.mode === "custom" ? "creation.custom" : "creation.quickPlay")); }
    } finally {
      if (current === generation.current) { busy.current = false; setWorking(false); abort.current = null; }
    }
  };
  return { diagnostics, ready, wait, working, hasPending, mode, message, memoryOnly, terminal, begin: (intent: Intent) => run(intent), retry: () => run(),
    discard: () => { if (busy.current) return; persist(null); pending.current = null; setMode(null); setHasPending(false); setTerminal(false); setMessage(""); setDiagnostics([]); } };
}
