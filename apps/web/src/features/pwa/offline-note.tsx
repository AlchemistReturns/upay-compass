"use client";

import { useTranslation } from "react-i18next";
import { useOnline } from "./use-online";

/** Small explanation shown beside a disabled write action while the phone is offline. */
export function OfflineNote() {
  const { t } = useTranslation();
  const online = useOnline();
  if (online) return null;
  return (
    <p className="text-muted-foreground text-sm" role="status">
      {t("pwa.offline_write")}
    </p>
  );
}
