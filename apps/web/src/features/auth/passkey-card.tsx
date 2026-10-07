"use client";

import { useEffect, useState } from "react";
import { Fingerprint, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { formatShortDate } from "@/lib/format";
import { passkeySupported } from "./passkey";
import { useAddPasskey, useDeletePasskey, usePasskeys } from "./use-passkeys";

/** "Chrome · Android" style label, so people can tell their devices apart in the list. */
function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(ua)
      ? "iOS"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Mac OS X/i.test(ua)
          ? "Mac"
          : /Linux/i.test(ua)
            ? "Linux"
            : "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "";
  return [browser, os].filter(Boolean).join(" · ");
}

/** Profile card: turn on fingerprint / face / screen-lock unlock and manage the devices that have it. */
export function PasskeyCard() {
  const { t, i18n } = useTranslation();
  const passkeys = usePasskeys();
  const add = useAddPasskey();
  const remove = useDeletePasskey();
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void passkeySupported().then((ok) => alive && setSupported(ok));
    return () => {
      alive = false;
    };
  }, []);

  const rows = passkeys.data ?? [];

  return (
    <section className="finance-card space-y-3 p-5 sm:p-6" aria-labelledby="profile-passkey">
      <h2 id="profile-passkey" className="flex items-center gap-2 text-[17px] font-bold">
        <Fingerprint className="text-primary size-[18px]" aria-hidden />
        {t("passkey.title")}
      </h2>
      <p className="text-muted-foreground text-sm leading-6">{t("passkey.hint")}</p>

      {rows.length > 0 && (
        <ul className="divide-hairline divide-y">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {r.device_name || t("passkey.this_device")}
                </div>
                <div className="text-muted-foreground text-xs">
                  {t("passkey.added", { date: formatShortDate(r.created_at, i18n.language) })}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("passkey.remove")}
                disabled={remove.isPending}
                onClick={() => remove.mutate(r.id)}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {supported === false ? (
        <p className="text-muted-foreground text-sm">{t("passkey.unsupported")}</p>
      ) : (
        <Button
          variant="outline"
          className="w-full"
          disabled={supported === null || add.isPending}
          onClick={() => add.mutate(deviceLabel())}
        >
          <Fingerprint aria-hidden />
          {add.isPending ? t("common.saving") : t("passkey.add")}
        </Button>
      )}
      {add.isError && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {t("passkey.failed")}
        </p>
      )}
    </section>
  );
}
