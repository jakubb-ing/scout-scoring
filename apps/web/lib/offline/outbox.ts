"use client";

/**
 * Generická offline fronta mutací (outbox).
 *
 * Mutace se registrují přes `registerOutboxKind` — nová offline mutace je
 * nová položka v registru, ne kopie kódu. Zápis jde nejdřív do Dexie
 * a optimisticky do react-query cache (`onApplied`), pak se flusher pokusí
 * o síť. Viz docs/offline-station-plan.md.
 */

import type { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import { offlineDb, type OutboxItem, type OutboxStatus } from "./db";

/** Co udělat s položkou po chybě odeslání. */
export type ErrorDisposition = "retry" | "drop" | "blocked" | "blocked_auth";

export interface MutationRegistration<TPayload = unknown, TResult = unknown> {
  send: (payload: TPayload) => Promise<TResult>;
  dedupeKey: (payload: TPayload) => string;
  /**
   * Položky se stejným chainKey drží pořadí a selhání blokuje další
   * v řetězci. Default: každá položka je vlastní řetězec (dedupeKey).
   */
  chainKey?: (payload: TPayload) => string;
  /** Optimistický zápis do react-query cache při zařazení do fronty. */
  onApplied: (qc: QueryClient, payload: TPayload) => void;
  /** Po skutečném přijetí serverem (dostane odpověď). */
  onFlushed?: (qc: QueryClient, payload: TPayload, result: TResult) => void;
  /** Per-kind override klasifikace chyb (např. 409 u feedback locku). */
  classifyError?: (error: unknown) => ErrorDisposition | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const registry = new Map<string, MutationRegistration<any, any>>();

export function registerOutboxKind<TPayload, TResult>(
  kind: string,
  registration: MutationRegistration<TPayload, TResult>
) {
  registry.set(kind, registration as MutationRegistration<any, any>);
}

export interface FlushResult {
  sent: number;
  dropped: { kind: string; payload: unknown; error: unknown }[];
  blocked: number;
  pendingAfter: number;
}

type FlushListener = (result: FlushResult) => void;
const flushListeners = new Set<FlushListener>();

export function onFlushResult(listener: FlushListener) {
  flushListeners.add(listener);
  return () => {
    flushListeners.delete(listener);
  };
}

let queryClient: QueryClient | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;

/** Zavolat jednou z Providers — připojí queryClient a spustí flusher. */
export function initOutbox(qc: QueryClient) {
  queryClient = qc;
  if (typeof window === "undefined") return;
  if (!flushTimer) {
    flushTimer = setInterval(() => void flushOutbox(), 30_000);
    window.addEventListener("online", () => void flushOutbox());
    void flushOutbox();
  }
}

export async function enqueue(kind: string, payload: unknown): Promise<void> {
  const reg = registry.get(kind);
  if (!reg) throw new Error(`Outbox kind "${kind}" is not registered`);
  if (!queryClient) throw new Error("Outbox is not initialized");

  const dedupeKey = reg.dedupeKey(payload);
  const chainKey = reg.chainKey?.(payload) ?? dedupeKey;

  await offlineDb.transaction("rw", offlineDb.outbox, async () => {
    const existing = await offlineDb.outbox.where("dedupeKey").equals(dedupeKey).first();
    if (existing) {
      await offlineDb.outbox.update(existing.id, {
        payload,
        chainKey,
        createdAt: Date.now(),
        attempts: 0,
        lastError: null,
        status: "pending",
      });
    } else {
      await offlineDb.outbox.add({
        kind,
        dedupeKey,
        chainKey,
        payload,
        createdAt: Date.now(),
        attempts: 0,
        lastError: null,
        status: "pending",
      } as OutboxItem);
    }
  });

  reg.onApplied(queryClient, payload);
  void flushOutbox();
}

function defaultClassify(error: unknown): ErrorDisposition {
  if (error instanceof ApiError) {
    if (error.status === 401) return "blocked_auth";
    if (error.status === 423) return "blocked"; // závod uzavřen — R3, nikdy nezahazovat
    if (error.status === 408 || error.status === 429) return "retry";
    if (error.status >= 400 && error.status < 500) return "drop";
    return "retry"; // 5xx
  }
  return "retry"; // síť / timeout
}

async function runFlush(): Promise<void> {
  if (!queryClient) return;
  const qc = queryClient;

  const items = await offlineDb.outbox.where("status").equals("pending").sortBy("id");
  if (items.length === 0) return;

  const result: FlushResult = { sent: 0, dropped: [], blocked: 0, pendingAfter: 0 };
  const failedChains = new Set<string>();

  for (const item of items) {
    if (failedChains.has(item.chainKey)) continue;
    const reg = registry.get(item.kind);
    if (!reg) continue; // kind z jiné verze appky — nechat, neumíme odeslat

    try {
      const response = await reg.send(item.payload);
      await offlineDb.outbox.delete(item.id);
      reg.onFlushed?.(qc, item.payload, response);
      result.sent += 1;
    } catch (error) {
      const disposition = reg.classifyError?.(error) ?? defaultClassify(error);
      const message = error instanceof Error ? error.message : String(error);
      failedChains.add(item.chainKey);

      if (disposition === "drop") {
        await offlineDb.outbox.delete(item.id);
        result.dropped.push({ kind: item.kind, payload: item.payload, error });
      } else if (disposition === "blocked" || disposition === "blocked_auth") {
        await offlineDb.outbox.update(item.id, {
          status: disposition as OutboxStatus,
          lastError: message,
          attempts: item.attempts + 1,
        });
        result.blocked += 1;
      } else {
        await offlineDb.outbox.update(item.id, {
          lastError: message,
          attempts: item.attempts + 1,
        });
      }
    }
  }

  result.pendingAfter = await offlineDb.outbox.where("status").equals("pending").count();
  for (const listener of flushListeners) listener(result);
}

/**
 * Flush běží pod Web Lockem — dva otevřené taby jinak posílají frontu
 * souběžně. Když lock drží jiný tab, tenhle průchod se přeskočí.
 */
export async function flushOutbox(): Promise<void> {
  if (typeof window === "undefined") return;
  if (navigator.locks?.request) {
    await navigator.locks.request("ss.outbox-flush", { ifAvailable: true }, async (lock) => {
      if (lock) await runFlush();
    });
  } else {
    await runFlush();
  }
}

/** Po úspěšném re-loginu vrátí položky zablokované na 401 do fronty. */
export async function resumeAuthBlocked(chainKeyPrefix?: string): Promise<void> {
  const blocked = await offlineDb.outbox.where("status").equals("blocked_auth").toArray();
  const toResume = chainKeyPrefix
    ? blocked.filter((i) => i.chainKey.startsWith(chainKeyPrefix))
    : blocked;
  await offlineDb.outbox.bulkUpdate(
    toResume.map((i) => ({ key: i.id, changes: { status: "pending" as OutboxStatus, attempts: 0 } }))
  );
  void flushOutbox();
}

/** Vrátí `blocked` položky řetězce do fronty (např. po převzetí locku). */
export async function resumeBlocked(chainKeyPrefix: string): Promise<void> {
  const blocked = await offlineDb.outbox.where("status").equals("blocked").toArray();
  const toResume = blocked.filter((i) => i.chainKey.startsWith(chainKeyPrefix));
  await offlineDb.outbox.bulkUpdate(
    toResume.map((i) => ({ key: i.id, changes: { status: "pending" as OutboxStatus, attempts: 0 } }))
  );
  void flushOutbox();
}

/** Smaže položky (např. při explicitním odhlášení stanoviště). */
export async function clearOutbox(chainKeyPrefix?: string): Promise<number> {
  if (!chainKeyPrefix) {
    const count = await offlineDb.outbox.count();
    await offlineDb.outbox.clear();
    return count;
  }
  const items = await offlineDb.outbox.filter((i) => i.chainKey.startsWith(chainKeyPrefix)).toArray();
  await offlineDb.outbox.bulkDelete(items.map((i) => i.id));
  return items.length;
}
