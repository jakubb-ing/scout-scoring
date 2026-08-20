"use client";

import * as React from "react";
import { QueryClient } from "@tanstack/react-query";
import {
  PersistQueryClientProvider,
  type PersistedClient,
  type Persister,
} from "@tanstack/react-query-persist-client";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { del, get, set } from "idb-keyval";
import { ApiError } from "@/lib/api/client";
import { shouldPersistQuery } from "@/lib/offline/persisted-queries";
import { initOutbox } from "@/lib/offline/outbox";
import { SwUpdatePrompt } from "@/components/sw-update-prompt";
import { ReactNode, useEffect, useState } from "react";
// Side-effect: registrace offline mutací do outbox registru.
import "@/lib/offline/register";

const PERSIST_KEY = "ss.query-cache";
// Stejné okno jako TTL station tokenu — u dvoudenního závodu nesmí cache
// vypršet dřív než token.
const PERSIST_MAX_AGE_MS = 72 * 60 * 60 * 1000;

function createIdbPersister(): Persister {
  return {
    persistClient: (client: PersistedClient) => set(PERSIST_KEY, client),
    restoreClient: () => get<PersistedClient>(PERSIST_KEY),
    removeClient: () => del(PERSIST_KEY),
  };
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            retry: (failureCount, error) => {
              if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
              return failureCount < 2;
            },
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );
  const [persister] = useState(createIdbPersister);

  useEffect(() => {
    initOutbox(client);
  }, [client]);

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: PERSIST_MAX_AGE_MS,
        buster: process.env.NEXT_PUBLIC_APP_VERSION ?? "",
        dehydrateOptions: {
          // Persistuje se jen allowlist (station data) — nic
          // z organizátorské části se do IndexedDB nedostane omylem.
          shouldDehydrateQuery: shouldPersistQuery,
        },
      }}
    >
      {children}
      <SwUpdatePrompt />
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
    </PersistQueryClientProvider>
  );
}
