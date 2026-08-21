// Outbox stojí na Dexie/IndexedDB — testuje se proti reálnému Dexie nad
// in-memory implementací, ne proti mocku. Mock by potvrdil jen sám sebe.
import "fake-indexeddb/auto";

// Node nemá `window`; lib/offline se na jeho existenci ptá, než sáhne na
// event listenery a localStorage. Doplníme jen to, co testy potřebují.
const globals = globalThis as Record<string, unknown>;

if (typeof globals.window === "undefined") {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const store = new Map<string, string>();

  globals.window = {
    navigator: globals.navigator,
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(fn);
    },
    removeEventListener: (type: string, fn: (event: unknown) => void) => {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent: (event: { type: string }) => {
      listeners.get(event.type)?.forEach((fn) => fn(event));
      return true;
    },
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    },
  };
}
