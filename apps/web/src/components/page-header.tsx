"use client";

import Link from "next/link";
import { Bell, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageToggle } from "@/components/language-toggle";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { useUnreadNudgeCount } from "@/features/nudges/use-nudges";
import { useRealtimeInvalidate } from "@/features/realtime/use-realtime-invalidate";

function NudgeBell() {
  const { t } = useTranslation();
  const unread = useUnreadNudgeCount();
  useRealtimeInvalidate("nudges", [["nudges"]]);
  const count = unread.data ?? 0;

  return (
    <Link
      href="/nudges"
      aria-label={count > 0 ? t("nudges.bell_unread", { count }) : t("nudges.title")}
      className="relative flex size-11 items-center justify-center rounded-lg"
    >
      <Bell className="size-5" aria-hidden />
      {count > 0 && (
        <span className="bg-destructive absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

export function PageHeader({ title }: { title: string }) {
  const { t } = useTranslation();
  const { session, signOut } = useAuth();

  return (
    <header className="flex items-center justify-between py-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="flex items-center gap-1">
        {session && <NudgeBell />}
        <LanguageToggle />
        {session && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("common.logout")}
            onClick={() => void signOut()}
          >
            <LogOut className="size-4" aria-hidden />
          </Button>
        )}
      </div>
    </header>
  );
}
