"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./page.module.css";
type Register = (section: string, action: () => Promise<void>) => () => void;
const RefreshContext = createContext<Register>(() => () => {});
export function PlayRefresh({ children, label, busyLabel }: { children: ReactNode; label: string; busyLabel: string }) {
  const actions = useRef(new Map<string, () => Promise<void>>());
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(0);
  const register = useCallback<Register>((section, action) => {
    actions.current.set(section, action);
    setReady(actions.current.size);
    return () => { actions.current.delete(section); setReady(actions.current.size); };
  }, []);
  return <RefreshContext value={register}>
    <div className={styles.toolbar}><button type="button" disabled={busy || ready < 2} onClick={async () => {
      setBusy(true);
      await Promise.allSettled([...actions.current.values()].map(action => action()));
      setBusy(false);
    }}>{busy ? busyLabel : label}</button></div>
    {children}
  </RefreshContext>;
}
export function usePlayRefresh(section: string, action: () => Promise<void>) {
  const register = useContext(RefreshContext);
  useEffect(() => register(section, action), [register, section, action]);
}
