"use client";

import { useEffect } from "react";
import { CloudOff, CloudUpload, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useOutboxStatus } from "@/lib/offline/hooks";
import { onFlushResult } from "@/lib/offline/outbox";

/**
 * Indikátor offline stavu v hlavičce stanoviště.
 *
 * | stav             | zobrazení                                   |
 * |------------------|---------------------------------------------|
 * | online, čisto    | nic                                         |
 * | offline, čisto   | „Offline režim"                             |
 * | pending > 0      | „N zápisů čeká" (přebíjí Offline — stav je  |
 * |                  | „data nejsou v DB", ne „nemám signál")      |
 * | flush >0 → 0     | jednorázový toast o uložení                 |
 */
export function OfflineIndicator({ chainKeyPrefix }: { chainKeyPrefix: string }) {
  const { isOffline, pendingCount, blockedCount, authBlockedCount } =
    useOutboxStatus(chainKeyPrefix);

  useEffect(() => {
    return onFlushResult((result) => {
      if (result.sent > 0 && result.pendingAfter === 0) {
        toast.success(
          result.sent === 1
            ? "1 zápis uložen do databáze"
            : `${result.sent} zápisů uloženo do databáze`
        );
      }
      // Vyprázdnění fronty odhozením položek musí hlásit chybu, ne úspěch.
      if (result.dropped.length > 0) {
        toast.error(`${result.dropped.length} zápisů server odmítl — zkontroluj je.`);
      }
    });
  }, []);

  if (authBlockedCount > 0) {
    return (
      <Badge variant="secondary" className="gap-1 bg-red-500/20 text-white">
        <KeyRound className="h-3 w-3" />
        {authBlockedCount} čeká — přihlas se znovu
      </Badge>
    );
  }

  if (pendingCount > 0 || blockedCount > 0) {
    return (
      <Badge variant="secondary" className="gap-1 bg-amber-400/25 text-white">
        <CloudUpload className="h-3 w-3" />
        {pendingCount + blockedCount} čeká na odeslání
      </Badge>
    );
  }

  if (isOffline) {
    return (
      <Badge variant="secondary" className="gap-1 bg-white/15 text-white/90">
        <CloudOff className="h-3 w-3" />
        Offline režim
      </Badge>
    );
  }

  return null;
}
