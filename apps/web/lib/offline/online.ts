"use client";

/**
 * Sdílená detekce offline stavu.
 *
 * `navigator.onLine` u captive portálů lže, proto se jako signál „offline"
 * bere i vytimeoutovaný / síťově selhavší request (hlásí ho apiFetch přes
 * `reportNetworkFailure`). Úspěšný request stav zase vrací na online.
 */

import { useSyncExternalStore } from "react";

let offline = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function setOffline(value: boolean) {
  if (offline === value) return;
  offline = value;
  emit();
}

if (typeof window !== "undefined") {
  offline = !window.navigator.onLine;
  window.addEventListener("online", () => setOffline(false));
  window.addEventListener("offline", () => setOffline(true));
}

/** Volá apiFetch při timeoutu nebo síťové chybě. */
export function reportNetworkFailure() {
  setOffline(true);
}

/** Volá apiFetch po každé úspěšně doručené odpovědi. */
export function reportNetworkSuccess() {
  setOffline(false);
}

export function isOffline() {
  return offline;
}

export function subscribeOffline(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useIsOffline(): boolean {
  return useSyncExternalStore(
    subscribeOffline,
    () => offline,
    () => false
  );
}
