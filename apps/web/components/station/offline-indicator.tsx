"use client";

import { useEffect } from "react";
import { AlertTriangle, Check, CloudOff, CloudUpload, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useOutboxStatus } from "@/lib/offline/hooks";
import { onFlushResult } from "@/lib/offline/outbox";

/**
 * Stav zápisů v hlavičce stanoviště. Rozhodčí musí poznat rozdíl mezi
 * „je to v databázi" a „mám to jen v telefonu" — bez toho neví, jestli
 * může zavřít appku.
 *
 * | stav               | zobrazení                                   |
 * |--------------------|---------------------------------------------|
 * | online, čisto      | decentní „Online"                           |
 * | offline, čisto     | „Offline — zápisy se ukládají v zařízení"   |
 * | pending > 0        | „N zápisů čeká na odeslání"                 |
 * | blocked > 0        | „N zápisů vyžaduje řešení"                  |
 * | flush >0 → 0       | jednorázový toast o uložení do databáze     |
 */
export function OfflineIndicator({ chainKeyPrefix }: { chainKeyPrefix: string }) {
  const { isOffline, pendingCount, blockedCount, authBlockedCount } =
    useOutboxStatus(chainKeyPrefix);

  useEffect(() => {
    return onFlushResult((result) => {
      if (result.sent > 0 && result.pendingAfter === 0) {
        toast.success(
          result.sent === 1
            ? "Zápis uložen do databáze"
            : `${result.sent} zápisů uloženo do databáze`
        );
      }
      // Vyprázdnění fronty odhozením položek musí hlásit chybu, ne úspěch.
      if (result.dropped.length > 0) {
        toast.error(`${result.dropped.length} zápisů server odmítl — zkontroluj je.`);
      }
    });
  }, []);

  // Zablokované zápisy jsou jediný stav, který po rozhodčím něco chce.
  if (authBlockedCount > 0) {
    return (
      <StatusBadge tone="danger" icon={<KeyRound className="h-3 w-3" />}>
        {authBlockedCount} vyžaduje přihlášení
      </StatusBadge>
    );
  }

  if (blockedCount > 0) {
    return (
      <StatusBadge tone="danger" icon={<AlertTriangle className="h-3 w-3" />}>
        {blockedCount === 1 ? "1 zápis vyžaduje řešení" : `${blockedCount} zápisů vyžaduje řešení`}
      </StatusBadge>
    );
  }

  if (pendingCount > 0) {
    return (
      <StatusBadge tone="warning" icon={<CloudUpload className="h-3 w-3" />}>
        {pendingCount === 1 ? "1 zápis čeká na odeslání" : `${pendingCount} zápisů čeká na odeslání`}
      </StatusBadge>
    );
  }

  if (isOffline) {
    return (
      <StatusBadge tone="muted" icon={<CloudOff className="h-3 w-3" />}>
        <span className="hidden sm:inline">Offline — zápisy se ukládají v zařízení</span>
        <span className="sm:hidden">Offline</span>
      </StatusBadge>
    );
  }

  return (
    <StatusBadge tone="ok" icon={<Check className="h-3 w-3" />}>
      <span className="hidden sm:inline">Online</span>
    </StatusBadge>
  );
}

function StatusBadge({
  tone,
  icon,
  children,
}: {
  tone: "ok" | "muted" | "warning" | "danger";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const tones = {
    ok: "bg-white/10 text-white/70",
    muted: "bg-white/15 text-white/90",
    warning: "bg-amber-400/25 text-white",
    danger: "bg-red-500/25 text-white",
  } as const;

  return (
    <Badge variant="secondary" className={`gap-1 whitespace-nowrap ${tones[tone]}`}>
      {icon}
      {children}
    </Badge>
  );
}
