import type { Query } from "@tanstack/react-query";

/**
 * Allowlist prefixů query keys, které se smí persistovat do IndexedDB.
 * Nová offline část = jeden řádek sem. Nic z organizátorské části se
 * nepersistuje omylem.
 */
const PERSISTED_KEY_PREFIXES: readonly (readonly string[])[] = [
  // qk.stationMe(id) / qk.stationEntries(id) — viz lib/queries/keys.ts
  ["station", "by-id"],
  // qk.feedbackMe(id) — offline stránka zpětné vazby doprovodu
  ["feedback", "by-id"],
];

export function shouldPersistQuery(query: Query): boolean {
  if (query.state.status !== "success") return false;
  const key = query.queryKey;
  return PERSISTED_KEY_PREFIXES.some((prefix) =>
    prefix.every((part, i) => key[i] === part)
  );
}
