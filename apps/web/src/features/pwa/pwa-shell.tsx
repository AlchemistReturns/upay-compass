"use client";

import { useEffect } from "react";
import { WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOnline } from "./use-online";

/** Registers the service worker (production builds only; removes a leftover one in development) and shows a banner while offline. */
export function PwaShell() {
  const { t } = useTranslation();
  const online = useOnline();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // Development: never keep a service worker or its saved files from an earlier production run
      // on this address, or old code is served next to new code.
      void navigator.serviceWorker
        .getRegistrations()
        .then((all) => all.forEach((r) => void r.unregister()));
      void caches
        ?.keys()
        .then((keys) =>
          keys.filter((k) => k.startsWith("compass-")).forEach((k) => void caches.delete(k)),
        );
      return;
    }
    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {
      // the app works without it; only offline reading is lost
    });
  }, []);

  if (online) return null;
  return (
    <div
      role="status"
      className="bg-brand-ink text-on-dark sticky top-0 z-50 flex items-center justify-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2 text-center text-[13px] font-medium"
    >
      <WifiOff className="text-lime size-4 shrink-0" aria-hidden />
      {t("pwa.offline_banner")}
    </div>
  );
}
