"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Hlídá čekající (waiting) service worker a nabídne výměnu verze.
 * SW má skipWaiting vypnuté — nová verze se aktivuje až tady, po kliknutí,
 * aby se appka nevyměnila rozhodčímu uprostřed vyplňování.
 */
export function SwUpdatePrompt() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const promptFor = (waiting: ServiceWorker) => {
      toast("Je k dispozici nová verze aplikace", {
        id: "sw-update",
        duration: Infinity,
        action: {
          label: "Obnovit",
          onClick: () => waiting.postMessage({ type: "SKIP_WAITING" }),
        },
      });
    };

    void navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return;
      if (registration.waiting) promptFor(registration.waiting);

      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          // "installed" + existující controller = čeká nová verze.
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            promptFor(installing);
          }
        });
      });
    });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
