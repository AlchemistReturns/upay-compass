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

/**
 * A free-standing round toolbar button (page actions, back). Liquid glass, same height as the
 * account cluster so the whole toolbar sits on one line.
 */
export const TOOLBAR_BUTTON =
  "liquid liquid-btn size-12 shrink-0 text-foreground disabled:opacity-45 [&_svg]:size-5";

/** Buttons inside the account cluster: 44px targets inside the 48px capsule. */
const CLUSTER_BUTTON = "liquid-btn size-11 shrink-0";

function NudgeBell({ className }: { className?: string }) {
  const { t } = useTranslation();
  const unread = useUnreadNudgeCount();
  useRealtimeInvalidate("nudges", [["nudges"]]);
  const count = unread.data ?? 0;

  // ring the bell once when a new alert arrives while the page is open (not on first load)
  const previous = useRef<number | null>(null);
  const [ring, setRing] = useState(0);
  useEffect(() => {
    if (!unread.isSuccess) return;
    if (previous.current !== null && count > previous.current) setRing((n) => n + 1);
    previous.current = count;
  }, [count, unread.isSuccess]);

  return (
    <Link
      href="/nudges"
      transitionTypes={NAV_FORWARD}
      aria-label={count > 0 ? t("nudges.bell_unread", { count }) : t("nudges.title")}
      className={className ?? CLUSTER_BUTTON}
    >
      <Bell
        key={ring}
        className={cn("ic-bell size-[20px]", ring > 0 && "is-ringing")}
        strokeWidth={1.9}
        aria-hidden
      />
      {count > 0 && (
        <span
          key={count}
          className="bg-destructive pop-spring absolute top-1 right-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[10px] leading-none font-bold text-white tabular-nums shadow-[0_0_0_2px_var(--background)]"
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

/**
 * Alerts bell and account avatar, always visible (no hidden tray). Language and appearance
 * live on the Me screen and in the account menu.
 */
function AccountCluster() {
  const { session } = useAuth();

  if (!session) {
    return (
      <div className="liquid flex h-12 shrink-0 items-center rounded-full p-0.5">
        <LanguageToggle className={CLUSTER_BUTTON} />
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <NudgeBell className={TOOLBAR_BUTTON} />
      <UserMenu triggerClassName={TOOLBAR_BUTTON} />
    </div>
  );
}

/**
 * Every screen's header, iOS style: a large title in the page, and a toolbar that floats over
 * the content. Once the large title scrolls away, a soft blurred edge fades in behind the
 * toolbar (no hard line) and the title settles into it. `back` adds a back button; `actions`
 * are page-specific toolbar buttons (style them with TOOLBAR_BUTTON).
 */
export function PageHeader({
  title,
  lead,
  subtitle,
  eyebrow,
  eyebrowIcon,
  icon,
  actions,
  back,
}: {
  title: string;
  /** a lighter first line of the large title, e.g. "Good morning," */
  lead?: string;
  subtitle?: string;
  /** small line above the title, e.g. today's date */
  eyebrow?: string;
  eyebrowIcon?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  back?: string;
}) {
  const { t } = useTranslation();
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
        data-vt="page-toolbar"
        data-scrolled={scrolled || undefined}
        className="sticky top-0 z-30 mx-[calc(50%-50cqw)] px-[calc(50cqw-50%)] pt-[env(safe-area-inset-top)]"
      >
        {/* scroll edge: tint + blur that fade out downward instead of ending in a line */}
        <div
          aria-hidden
          className={cn(
            "scroll-edge pointer-events-none absolute inset-x-0 top-0 -bottom-6 transition-opacity duration-300",
            scrolled ? "opacity-100" : "opacity-0",
          )}
        />
        <div className="relative flex h-[4.25rem] items-center gap-2">
          {back ? (
            <Link
              href={back}
              transitionTypes={NAV_BACK}
              aria-label={t("common.back")}
              className={TOOLBAR_BUTTON}
            >
              <ChevronLeft className="ic-back size-[22px]" strokeWidth={2.3} aria-hidden />
            </Link>
          ) : (
            <Link
              href="/"
              aria-label="upay Compass"
              className="brand-link tap shrink-0 rounded-[15px] lg:hidden"
            >
              <BrandMark className="size-11 shadow-[0_8px_18px_-10px_rgba(9, 29, 74,.7)]" />
            </Link>
          )}
          <div
            aria-hidden
            className={cn(
              "min-w-0 flex-1 truncate pl-1 text-[17px] font-bold tracking-tight transition-[opacity,translate] duration-300",
              scrolled
                ? "translate-y-0 opacity-100"
                : "pointer-events-none translate-y-1.5 opacity-0",
            )}
          >
            {lead ? `${lead} ${title}` : title}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <AccountCluster />
          </div>
        </div>
      </header>

      <div className="pt-1.5 pb-5 sm:pt-3 sm:pb-7">
        {eyebrow && (
          <p
            style={{ "--d": "0ms" } as React.CSSProperties}
            className="text-muted-foreground hdr-in mb-1.5 flex items-center gap-1.5 px-0.5 text-[12.5px] font-semibold tracking-[0.06em] uppercase"
          >
            {eyebrowIcon && <span className="hdr-icon text-primary">{eyebrowIcon}</span>}
            {eyebrow}
          </p>
        )}
        <div className="flex items-center gap-3">
          {icon && <span className="icon-chip size-12 rounded-2xl">{icon}</span>}
          <div className="min-w-0">
            <h1 className="text-[1.875rem] leading-[1.12] font-extrabold tracking-[-0.025em] text-balance sm:text-[2.25rem]">
              {lead && (
                <span
                  style={{ "--d": "80ms" } as React.CSSProperties}
                  className="hdr-in text-muted-foreground block text-[1.375rem] leading-tight font-semibold tracking-[-0.015em] sm:text-[1.625rem]"
                >
                  {lead}
                </span>
              )}
              <span
                style={{ "--d": "170ms" } as React.CSSProperties}
                className={cn("hdr-in block", lead && "hdr-name")}
              >
                {title}
              </span>
            </h1>
            {subtitle && (
              <p
                style={{ "--d": "270ms" } as React.CSSProperties}
                className="text-muted-foreground hdr-in mt-1.5 text-[15px] leading-snug"
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>
      </div>
      <div ref={sentinel} aria-hidden className="-mt-px h-px" />
    </>
  );
}
