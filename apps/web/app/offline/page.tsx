"use client";

import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

// Navigation fallback service workeru — servíruje se, když offline
// navigace nemá HTML v cache (typicky první návštěva dynamické routy).
export default function OfflinePage() {
  return (
    <main className="grid min-h-screen place-items-center px-6 text-center">
      <div className="max-w-md space-y-4">
        <WifiOff className="mx-auto h-8 w-8 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Bez připojení</h1>
        <p className="text-sm text-muted-foreground">
          Tahle stránka ještě není uložená pro offline použití. Zkontroluj
          připojení a zkus to znovu.
        </p>
        <Button onClick={() => window.location.reload()}>Zkusit znovu</Button>
      </div>
    </main>
  );
}
