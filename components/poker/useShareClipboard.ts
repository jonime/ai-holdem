"use client";
import { useCallback, useEffect, useRef, useState } from "react";
/** Shared copy feedback and selectable URL fallback; fence late clipboard results. */
export function useShareClipboard() {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  useEffect(() => { const current = generation; ++current.current; return () => { ++current.current; }; }, []);
  const reset = useCallback(() => { setCopied(false); setFallback(false); }, []);
  async function copy(url: string) {
    if (lock.current) return;
    const current = generation.current;
    lock.current = true; setPending(true); reset();
    try { await navigator.clipboard.writeText(url); if (current === generation.current) setCopied(true); }
    catch { if (current === generation.current) setFallback(true); }
    finally { lock.current = false; if (current === generation.current) setPending(false); }
  }
  return { copied, fallback, pending, copy, reset };
}
