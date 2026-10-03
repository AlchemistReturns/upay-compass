"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BrandMark } from "@/components/compass";
import { LanguageToggle } from "@/components/language-toggle";
import { UserMenu } from "@/components/user-menu";
import { useAuth } from "@/features/auth/auth-provider";
import { useUnreadNudgeCount } from "@/features/nudges/use-nudges";
import { useRealtimeInvalidate } from "@/features/realtime/use-realtime-invalidate";
import { NAV_BACK, NAV_FORWARD } from "@/components/page-transition";
import { cn } from "@/lib/utils";

/** Shared look for every round button in the header toolbar. */
export const TOOLBAR_BUTTON =
  "relative grid size-11 shrink-0 place-items-center rounded-full border border-[rgba(13,75,76,.08)] bg-card/85 text-foreground shadow-[0_1px_2px_rgba(6,47,49,.06)] backdrop-blur-md transition-[background-color,transform] duration-150 hover:bg-card active:scale-95 disabled:opacity-45";

function NudgeBell() {
  const { t } = useTranslation();
  const unread = useUnreadNudgeCount();
  useRealtimeInvalidate("nudges", [["nudges"]]);
  const count = unread.data ?? 0;

  return (
    <Link
      href="/nudges"
      transitionTypes={NAV_FORWARD}
      aria-label={count > 0 ? t("nudges.bell_unread", { count }) : t("nudges.title")}
      className={TOOLBAR_BUTTON}
    >
      <Bell className="size-[19px]" strokeWidth={1.9} aria-hidden />
      {count > 0 && (
        <span className="bg-destructive ring-background pop absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white tabular-nums ring-2">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

/**
 * Every screen's header, iOS style: a large title in the page, and a slim sticky bar that
 * frosts over and shows the title once the large one scrolls away. `back` adds a back button;
 * `actions` are page-specific toolbar buttons (style them with TOOLBAR_BUTTON).
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  icon,
  actions,
  back,
}: {
  title: string;
  subtitle?: string;
  /** small line above the title, e.g. today's date */
  eyebrow?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  back?: string;
}) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const sentinel = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    // the large title has scrolled under the bar once the sentinel below it leaves the top 64px
    const observer = new IntersectionObserver(
      ([entry]) =>
        setScrolled(entry ? !entry.isIntersecting && entry.boundingClientRect.top < 80 : false),
      { rootMargin: "-64px 0px 0px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* full-bleed across the content column (see the @container on the layout) */}
      <header
        style={{ viewTransitionName: "page-toolbar" }}
        className={cn(
          "sticky top-0 z-30 mx-[calc(50%-50cqw)] px-[calc(50cqw-50%)] pt-[env(safe-area-inset-top)] transition-[background-color,box-shadow,backdrop-filter] duration-300",
          scrolled
            ? "bg-background/78 shadow-[0_1px_0_rgba(13,75,76,.08)] backdrop-blur-xl backdrop-saturate-150"
            : "bg-transparent",
        )}
      >
        <div className="flex h-16 items-center gap-2.5">
          {back ? (
            <Link
              href={back}
              transitionTypes={NAV_BACK}
              aria-label={t("common.back")}
              className={TOOLBAR_BUTTON}
            >
              <ChevronLeft className="size-5" strokeWidth={2.2} aria-hidden />
            </Link>
          ) : (
            <Link href="/" aria-label="upay Compass" className="shrink-0 rounded-xl lg:hidden">
              <BrandMark className="size-10" />
            </Link>
          )}
          <div
            aria-hidden
            className={cn(
              "min-w-0 flex-1 truncate text-[17px] font-bold tracking-tight transition-[opacity,transform] duration-300",
              scrolled
                ? "translate-y-0 opacity-100"
                : "pointer-events-none translate-y-1 opacity-0",
            )}
          >
            {title}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            {session && <NudgeBell />}
            <LanguageToggle className={TOOLBAR_BUTTON} />
            {session && <UserMenu triggerClassName={TOOLBAR_BUTTON} />}
          </div>
        </div>
      </header>

      <div className="pt-2 pb-5 sm:pt-3 sm:pb-7">
        {eyebrow && (
          <p className="text-muted-foreground mb-1 px-0.5 text-[13px] font-semibold tracking-wide uppercase">
            {eyebrow}
          </p>
        )}
        <div className="flex items-center gap-3">
          {icon && <span className="icon-chip size-12 rounded-2xl">{icon}</span>}
          <div className="min-w-0">
            <h1 className="text-[1.875rem] leading-[1.15] font-extrabold tracking-[-0.025em] text-balance sm:text-[2.25rem]">
              {title}
            </h1>
            {subtitle && (
              <p className="text-muted-foreground mt-1.5 text-[15px] leading-snug">{subtitle}</p>
            )}
          </div>
        </div>
      </div>
      <div ref={sentinel} aria-hidden className="-mt-px h-px" />
    </>
  );
}
