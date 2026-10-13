"use client";
import { useEffect, useRef, useState } from "react";

export const actionsStorageKey = "ai-holdem-feed-collapsed";
export function useActionsPreference() {
  const [collapsed, setCollapsed] = useState(false);
  const current = useRef(false);
  const interacted = useRef(false);
  useEffect(() => {
    if (interacted.current) return;
    const mobile = window.matchMedia("(max-width: 900px)").matches;
    let value = mobile;
    try {
      const saved = window.localStorage.getItem(actionsStorageKey);
      if (!mobile && (saved === "true" || saved === "false")) value = saved === "true";
    } catch { /* Use the responsive default. */ }
    current.current = value;
    setCollapsed(value);
  }, []);
  function change(value: boolean) {
    interacted.current = true;
    current.current = value;
    setCollapsed(value);
    try { window.localStorage.setItem(actionsStorageKey, String(value)); }
    catch { /* Controls remain usable without persistence. */ }
  }
  return { collapsed, change, toggle: () => change(!current.current) };
}
