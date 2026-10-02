"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LANGUAGE_STORAGE_KEY } from "@/i18n";
import { LockScreen } from "./pin-forms";
import { useAuthStatus, type AuthStatus } from "./use-auth-status";

type Own = Extract<AuthStatus, "signed-out" | "needs-pin" | "needs-onboarding" | "ready">;

const DESTINATION: Record<Own, string> = {
  "signed-out": "/login",
  "needs-pin": "/set-pin",
  "needs-onboarding": "/onboarding",
  ready: "/",
};

/**
 * Renders children only when the visitor's auth state matches `own`; otherwise redirects
 * to the page that state belongs on. A locked app shows the PIN screen on every route.
 */
export function Guard({ own, children }: { own: Own; children: React.ReactNode }) {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { status, profile, retry } = useAuthStatus();
  const syncedLanguage = useRef<string | null>(null);

  // Once per user, adopt the language saved on their profile.
  useEffect(() => {
    if (!profile?.onboarded || syncedLanguage.current === profile.id) return;
    syncedLanguage.current = profile.id;
    if (profile.language !== i18n.language) {
      void i18n.changeLanguage(profile.language);
      try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, profile.language);
      } catch {
        // ignore
      }
    }
  }, [profile, i18n]);

  useEffect(() => {
    if (status === own || status === "loading" || status === "locked" || status === "error") {
      return;
    }
    router.replace(DESTINATION[status]);
  }, [status, own, router]);

  if (status === "locked") return <LockScreen />;

  if (status === "error") {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-8">
        <p className="mb-2">{t("common.error")}</p>
        <Button onClick={retry}>{t("common.retry")}</Button>
      </div>
    );
  }

  if (status !== own) {
    return (
      <p className="text-muted-foreground p-8 text-center" role="status">
        {t("common.loading")}
      </p>
    );
  }

  return <>{children}</>;
}
