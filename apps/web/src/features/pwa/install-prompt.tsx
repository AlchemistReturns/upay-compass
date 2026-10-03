"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "compass.install.dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Offers "install to home screen" when the browser says the app can be installed. */
export function InstallPrompt() {
  const { t } = useTranslation();
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser storage after mount
    setHidden(readDismissed());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => setEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!event || hidden) return null;

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // ignore
    }
  }

  async function install() {
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    setEvent(null);
  }

  return (
    <section
      className="finance-card flex items-center gap-3 p-4"
      aria-label={t("pwa.install_title")}
    >
      <Download className="text-primary size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{t("pwa.install_title")}</div>
        <div className="text-muted-foreground text-xs">{t("pwa.install_hint")}</div>
      </div>
      <Button size="sm" className="min-h-11" onClick={() => void install()}>
        {t("pwa.install")}
      </Button>
      <button
        type="button"
        aria-label={t("common.close")}
        className="flex size-11 items-center justify-center rounded-lg"
        onClick={dismiss}
      >
        <X className="size-4" aria-hidden />
      </button>
    </section>
  );
}
