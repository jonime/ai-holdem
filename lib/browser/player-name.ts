"use client";

import { useSyncExternalStore } from "react";

export const playerNameStorageKey = "ai-holdem-player-name";
type NameStore = { value: string; memoryOnly: boolean; listeners: Set<() => void> };
// Never create or read browser preference state during a server request.
const stores = new WeakMap<Window, NameStore>();
function store(): NameStore {
  let current = stores.get(window);
  if (!current) {
    let value = "";
    let memoryOnly = false;
    try { value = window.localStorage.getItem(playerNameStorageKey) ?? ""; }
    catch { memoryOnly = true; }
    current = { value, memoryOnly, listeners: new Set() };
    stores.set(window, current);
  }
  return current;
}
export function readPlayerName() {
  return typeof window === "undefined" ? "" : store().value;
}
export function savePlayerName(value: string) {
  if (typeof window === "undefined") return;
  const current = store();
  current.value = value;
  try { window.localStorage.setItem(playerNameStorageKey, value); }
  catch { current.memoryOnly = true; }
  current.listeners.forEach(listener => listener());
}
export function subscribePlayerName(listener: () => void) {
  const current = store();
  // Catch changes made while there were no mounted consumers. Once storage has
  // failed, never replace a newer in-memory choice with an older persisted value.
  if (!current.memoryOnly) {
    try { current.value = window.localStorage.getItem(playerNameStorageKey) ?? ""; }
    catch { current.memoryOnly = true; }
  }
  current.listeners.add(listener);
  function storage(event: StorageEvent) {
    if (event.key !== playerNameStorageKey && event.key !== null) return;
    try { if (event.storageArea && event.storageArea !== window.localStorage) return; }
    catch { return; }
    current.value = event.key === null ? "" : event.newValue ?? "";
    listener();
  }
  window.addEventListener("storage", storage);
  return () => {
    current.listeners.delete(listener);
    window.removeEventListener("storage", storage);
  };
}
export function playerNameServerSnapshot() { return ""; }
export function usePlayerName() {
  return useSyncExternalStore(subscribePlayerName, readPlayerName, playerNameServerSnapshot);
}
