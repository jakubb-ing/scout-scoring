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

    // V dev buildu se service worker negeneruje, ale ten z dřívějšího
    // produkčního buildu na stejném originu zůstane zaregistrovaný a dál
    // odchytává requesty — projeví se to jako `no-response` a zrušené
    // volání, které vůbec nedorazí na server. Odregistrovat.
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
        if (registrations.length === 0) return;
        await Promise.all(registrations.map((registration) => registration.unregister()));
        if (typeof caches !== "undefined") {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }
        window.location.reload();
      });
      return;
    }

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
