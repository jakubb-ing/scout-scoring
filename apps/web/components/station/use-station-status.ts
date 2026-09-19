"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useOutboxStatus } from "@/lib/offline/hooks";
import { onFlushResult } from "@/lib/offline/outbox";

export type StationStatusTone = "ok" | "waiting" | "danger";

export interface StationStatus {
  tone: StationStatusTone;
  /** Drobný uppercase popisek v prvním řádku hlavičky. */
  caption: string;
  /** Pozadí celé hlavičky — stav musí jít poznat periferně, bez čtení. */
  headerClass: string;
  /** Tečka vedle popisku. */
  dotClass: string;
  /** Výplň progress baru na spodní hraně hlavičky. */
  barClass: string;
}

/**
 * Stav zápisů stanoviště přeložený do vzhledu hlavičky. Rozhodčí musí poznat
 * rozdíl mezi „je to v databázi" a „mám to jen v telefonu" — bez toho neví,
 * jestli může zavřít appku.
 *
 * | stav              | hlavička            | popisek                        |
 * |-------------------|---------------------|--------------------------------|
 * | online, čisto     | modrá               | STANOVIŠTĚ #N                  |
 * | offline, čisto    | jantarová           | OFFLINE — ZÁPISY V ZAŘÍZENÍ    |
 * | pending > 0       | jantarová           | N ZÁPISŮ ČEKÁ NA ODESLÁNÍ      |
 * | blocked > 0       | červená             | N ZÁPISŮ VYŽADUJE ŘEŠENÍ       |
 *
 * Zablokované zápisy jsou jediný stav, který po rozhodčím něco chce, proto si
 * drží vlastní barvu i po připojení k síti.
 */
export function useStationStatus(chainKeyPrefix: string, stationNumber?: number): StationStatus {
  const { isOffline, pendingCount, blockedCount, authBlockedCount } = useOutboxStatus(chainKeyPrefix);

  useEffect(() => {
    return onFlushResult((result) => {
      if (result.sent > 0 && result.pendingAfter === 0) {
        toast.success(
          result.sent === 1 ? "Zápis uložen do databáze" : `${result.sent} zápisů uloženo do databáze`
        );
      }
      // Vyprázdnění fronty odhozením položek musí hlásit chybu, ne úspěch.
      if (result.dropped.length > 0) {
        toast.error(`${result.dropped.length} zápisů server odmítl — zkontroluj je.`);
      }
    });
  }, []);

  const danger = {
    tone: "danger" as const,
    headerClass: "bg-scout-red-deep",
    dotClass: "bg-scout-red",
    barClass: "bg-white/80",
  };
  const waiting = {
    tone: "waiting" as const,
    headerClass: "bg-scout-offline",
    dotClass: "bg-scout-yellow",
    barClass: "bg-scout-yellow",
  };

  if (authBlockedCount > 0) {
    return { ...danger, caption: `${authBlockedCount} ZÁPISŮ VYŽADUJE PŘIHLÁŠENÍ` };
  }

  if (blockedCount > 0) {
    return {
      ...danger,
      caption:
        blockedCount === 1 ? "1 ZÁPIS VYŽADUJE ŘEŠENÍ" : `${blockedCount} ZÁPISŮ VYŽADUJE ŘEŠENÍ`,
    };
  }

  if (pendingCount > 0) {
    // Fronta se plní i online (zápis jde do outboxu a odesílá se na pozadí) —
    // „offline" se do popisku dostane jen když opravdu není síť.
    const prefix = isOffline ? "OFFLINE · " : "";
    return {
      ...waiting,
      caption:
        pendingCount === 1
          ? `${prefix}1 ZÁPIS ČEKÁ NA ODESLÁNÍ`
          : `${prefix}${pendingCount} ZÁPISŮ ČEKÁ NA ODESLÁNÍ`,
    };
  }

  if (isOffline) {
    return { ...waiting, caption: "OFFLINE — ZÁPISY SE UKLÁDAJÍ V ZAŘÍZENÍ" };
  }

  return {
    tone: "ok",
    caption: stationNumber ? `STANOVIŠTĚ #${stationNumber}` : "STANOVIŠTĚ",
    headerClass: "bg-scout-blue",
    dotClass: "bg-scout-online",
    barClass: "bg-scout-yellow",
  };
}
