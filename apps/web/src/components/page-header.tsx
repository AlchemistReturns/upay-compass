"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageToggle } from "@/components/language-toggle";
import { UserMenu } from "@/components/user-menu";
import { useAuth } from "@/features/auth/auth-provider";
import { useUnreadNudgeCount } from "@/features/nudges/use-nudges";
import { useRealtimeInvalidate } from "@/features/realtime/use-realtime-invalidate";
import { cn } from "@/lib/utils";

/** Shared look for every button in the header toolbar: same size, same round shape, no own border. */
export const TOOLBAR_BUTTON =
  "hover:bg-muted text-foreground relative flex size-11 shrink-0 items-center justify-center rounded-full border-0 bg-transparent shadow-none backdrop-blur-none transition-colors";

function NudgeBell() {
  const { t } = useTranslation();
  const unread = useUnreadNudgeCount();
  useRealtimeInvalidate("nudges", [["nudges"]]);
  const count = unread.data ?? 0;

  return (
    <Link
      href="/nudges"
      aria-label={count > 0 ? t("nudges.bell_unread", { count }) : t("nudges.title")}
      className={TOOLBAR_BUTTON}
    >
      <Bell className="size-[18px]" aria-hidden />
      {count > 0 && (
        <span className="bg-destructive ring-card absolute top-1 right-1 flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] leading-[18px] font-semibold text-white ring-2">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

/**
 * Every screen's header: icon tile + title on the left, one toolbar pill on the right.
 * Fixed height so it does not jump between tabs. `actions` are page-specific toolbar buttons
 * (style them with TOOLBAR_BUTTON); they sit first in the pill, split off by a divider.
 */
export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const { session } = useAuth();

  return (
    <header className="bg-background/55 sticky top-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150 z-10 -mx-4 mb-2 flex min-h-[4.75rem] items-center justify-between gap-3 px-4 py-3 sm:min-h-[5.5rem]">
      {/* title in the same frosted pill as the toolbar, so both sides of the header match */}
      <div
        className={cn(
          "glass flex min-h-[50px] min-w-0 items-center gap-3 shadow-[inset_0_1px_0_rgba(255,255,255,.85),0_6px_20px_rgba(15,31,51,.08)]",
          subtitle ? "rounded-[1.5rem] py-1.5 pr-5 pl-4" : "rounded-full px-5",
          icon && "pl-1.5",
        )}
      >
        {icon && <span className="icon-chip size-10 rounded-full">{icon}</span>}
        <div className="min-w-0">
          <h1 className="truncate text-lg leading-6 font-bold sm:text-xl sm:leading-7">{title}</h1>
          {subtitle && (
            <p className="text-muted-foreground truncate text-xs leading-4">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="glass flex shrink-0 items-center rounded-full p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,.85),0_6px_20px_rgba(15,31,51,.08)]">
        {actions && (
          <>
            {actions}
            <span aria-hidden className="bg-border mx-0.5 h-6 w-px" />
          </>
        )}
        {session && <NudgeBell />}
        <LanguageToggle className={TOOLBAR_BUTTON} />
        {session && <UserMenu triggerClassName={TOOLBAR_BUTTON} />}
      </div>
    </header>
  );
}
