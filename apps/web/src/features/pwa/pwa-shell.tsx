"use client";

import { useEffect } from "react";
import { WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOnline } from "./use-online";

/** Registers the service worker (production builds only) and shows a banner while offline. */
export function PwaShell() {
  const { t } = useTranslation();
  const online = useOnline();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
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
