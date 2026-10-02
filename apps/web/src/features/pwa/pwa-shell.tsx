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
      className="bg-muted text-foreground sticky top-0 z-20 flex items-center justify-center gap-2 px-4 py-2 text-center text-sm"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      {t("pwa.offline_banner")}
    </div>
  );
}
