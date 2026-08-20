/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

// API odpovědi se v SW záměrně necachují — jsou cross-origin, nesou
// Authorization header a druhý zdroj pravdy vedle react-query se špatně
// ladí. Read cache žije v aplikaci (PersistQueryClientProvider).

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Nová verze se NEaktivuje sama uprostřed práce — čeká na potvrzení
  // z UI (SwUpdatePrompt pošle SKIP_WAITING).
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        // Dynamické routy (/station/[id], /feedback/[id]) nejsou
        // v precache manifestu — bez fallbacku by offline refresh
        // skončil na chrome-error stránce.
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

serwist.addEventListeners();
