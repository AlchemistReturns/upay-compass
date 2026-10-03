"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Bus,
  ChevronRight,
  Clapperboard,
  GraduationCap,
  HeartHandshake,
  HeartPulse,
  PiggyBank,
  ReceiptText,
  Shapes,
  ShoppingBag,
  Smartphone,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/skeleton";
import { NAV_FORWARD } from "@/components/page-transition";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ brand */

/** The Compass mark: a teal disc with a lime needle pointing north-east. Decorative. */
export function BrandMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 48 48" className={cn("size-9 shrink-0", className)} aria-hidden>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#13696a" />
          <stop offset="1" stopColor="#062f31" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="15" fill={`url(#${id}-bg)`} />
      <circle cx="24" cy="24" r="14.5" fill="none" stroke="#c3ea8c" strokeOpacity=".28" />
      <path d="M24 24 L34.2 13.8 L27.2 27.2 Z" fill="#c3ea8c" />
      <path d="M24 24 L13.8 34.2 L20.8 20.8 Z" fill="#f1f8ec" fillOpacity=".9" />
      <circle cx="24" cy="24" r="2.4" fill="#062f31" stroke="#c3ea8c" strokeWidth="1.4" />
    </svg>
  );
}

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      aria-label="upay Compass"
      className={cn("flex min-h-11 items-center gap-2.5 rounded-xl", className)}
    >
      <BrandMark />
      <span className="text-[17px] leading-none font-bold tracking-tight">
        upay <span className="text-muted-foreground font-medium">Compass</span>
      </span>
    </Link>
  );
}

/* --------------------------------------------------------------- numbers */

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Eases a number toward `target` (from 0 on first mount, then from the last value). */
export function useCountUp(target: number, duration = 750) {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  const frame = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      from.current = target;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- jump straight to the value
      setValue(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = origin + (target - origin) * eased;
      setValue(next);
      if (p < 1) frame.current = requestAnimationFrame(tick);
      else from.current = target;
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame.current);
      from.current = target;
    };
  }, [target, duration]);

  return value;
}

/** A number that counts up into place; `format` turns it into text. */
export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
}) {
  const shown = useCountUp(value);
  return <span className={cn("num", className)}>{format(shown)}</span>;
}

/* -------------------------------------------------------------- progress */

/** Circular progress. The arc draws in on mount; children sit in the middle. Decorative. */
export function Ring({
  value,
  size = 120,
  stroke = 10,
  track = "var(--muted)",
  color = "var(--primary)",
  className,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  track?: string;
  color?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(value, 100));
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        {pct > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct / 100)}
            style={
              {
                "--ring-full": `${c}px`,
                // backwards, not both: once drawn, later value changes glide via the transition
                animation: "ring-draw 1.1s var(--ease-out-soft) backwards",
                transition: "stroke-dashoffset .8s var(--ease-out-soft)",
              } as React.CSSProperties
            }
          />
        )}
      </svg>
      {children && (
        <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
      )}
    </div>
  );
}

/** Horizontal progress bar with an optional tick (e.g. where a budget alert fires). */
export function ProgressBar({
  value,
  color = "var(--primary)",
  tick,
  label,
  className,
  trackClassName,
}: {
  value: number;
  color?: string;
  /** 0–100, position of a thin marker */
  tick?: number;
  label?: string;
  className?: string;
  trackClassName?: string;
}) {
  const pct = Math.max(0, Math.min(value, 100));
  return (
    <div
      className={cn("track", trackClassName, className)}
      role={label ? "progressbar" : undefined}
      aria-label={label}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
      aria-valuenow={label ? Math.round(pct) : undefined}
      aria-hidden={label ? undefined : true}
    >
      <div
        className="fill"
        style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%`, background: color }}
      />
      {tick !== undefined && (
        <span
          aria-hidden
          className="bg-foreground/35 absolute inset-y-0 w-0.5 rounded-full"
          style={{ left: `calc(${tick}% - 1px)` }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ pills */

const PILL_TONE = {
  lime: "bg-lime text-brand-ink",
  good: "bg-positive-soft text-positive",
  warn: "bg-warning-soft text-warning-ink",
  critical: "bg-negative-soft text-destructive",
  muted: "bg-muted text-muted-foreground",
  mint: "bg-secondary text-secondary-foreground",
  dark: "bg-white/12 text-on-dark ring-1 ring-white/18",
  reward: "bg-reward-soft text-reward-ink",
} as const;

export function Pill({
  tone = "mint",
  className,
  children,
}: {
  tone?: keyof typeof PILL_TONE;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11.5px] leading-none font-semibold whitespace-nowrap [&_svg]:size-3",
        PILL_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* --------------------------------------------------------------- sections */

/** Section heading with an optional trailing link ("See all"). */
export function SectionHeader({
  title,
  hint,
  href,
  linkLabel,
  action,
  id,
  className,
}: {
  title: string;
  hint?: string;
  href?: string;
  linkLabel?: string;
  action?: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3 px-1", className)}>
      <div className="min-w-0">
        <h2 id={id} className="section-title">
          {title}
        </h2>
        {hint && <p className="text-muted-foreground mt-0.5 text-[13px]">{hint}</p>}
      </div>
      {action}
      {href && linkLabel && (
        <Link
          href={href}
          transitionTypes={NAV_FORWARD}
          className="text-primary hover:bg-secondary -mr-2 inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-full px-3 text-[13px] font-semibold transition-[background-color,transform] active:scale-95"
        >
          {linkLabel}
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- states */

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon: LucideIcon;
  title?: string;
  body: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "finance-card rise flex flex-col items-center gap-3 px-6 py-10 text-center",
        className,
      )}
    >
      <span className="bg-secondary text-primary relative grid size-16 place-items-center rounded-[1.4rem]">
        <span className="bg-lime/50 absolute -top-1 -right-1 size-4 rounded-full" aria-hidden />
        <Icon className="size-7" strokeWidth={1.75} aria-hidden />
      </span>
      {title && <p className="text-base font-bold">{title}</p>}
      <p className="text-muted-foreground max-w-xs text-sm leading-6">{body}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function ErrorState({ onRetry, className }: { onRetry?: () => void; className?: string }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className={cn("finance-card flex items-center gap-3 p-4 pr-3", className)}>
      <span className="icon-chip bg-negative-soft text-destructive">
        <AlertCircle className="size-5" aria-hidden />
      </span>
      <p className="min-w-0 flex-1 text-sm font-medium">{t("common.error")}</p>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      )}
    </div>
  );
}

/** Placeholder blocks shaped like the page that is loading. */
export function LoadingCards({ hero = false, rows = 3 }: { hero?: boolean; rows?: number }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3" role="status" aria-label={t("common.loading")}>
      {hero && <Skeleton className="h-44 rounded-[2rem]" />}
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-24 rounded-3xl" />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- categories */

const CATEGORY_STYLE: Record<string, { icon: LucideIcon; bg: string; fg: string }> = {
  food: { icon: UtensilsCrossed, bg: "#fff1de", fg: "#9a5a00" },
  transport: { icon: Bus, bg: "#e3f0fb", fg: "#1f5f95" },
  recharge_data: { icon: Smartphone, bg: "#efe9fb", fg: "#5b3ea3" },
  bills: { icon: ReceiptText, bg: "#e2f1f0", fg: "#0d5c5d" },
  education: { icon: GraduationCap, bg: "#e7ebfb", fg: "#3647a0" },
  shopping: { icon: ShoppingBag, bg: "#fbe8f1", fg: "#a2316b" },
  family: { icon: HeartHandshake, bg: "#fde9e5", fg: "#a83c25" },
  health: { icon: HeartPulse, bg: "#fce8e8", fg: "#b02f3c" },
  entertainment: { icon: Clapperboard, bg: "#f2e8fa", fg: "#7a3a9e" },
  savings: { icon: PiggyBank, bg: "#ecf8da", fg: "#3d7a1f" },
  income: { icon: Wallet, bg: "#e2f3e1", fg: "#1f7a3c" },
  other: { icon: Shapes, bg: "#edf1ef", fg: "#566d6c" },
};

export function categoryStyle(key: string | null | undefined) {
  return CATEGORY_STYLE[key ?? "other"] ?? CATEGORY_STYLE.other!;
}

/** Tinted rounded square with the category's icon. Decorative; the name is always written next to it. */
export function CategoryIcon({
  categoryKey,
  className,
  iconClassName,
}: {
  categoryKey: string | null | undefined;
  className?: string;
  iconClassName?: string;
}) {
  const { icon: Icon, bg, fg } = categoryStyle(categoryKey);
  return (
    <span className={cn("icon-chip", className)} style={{ background: bg, color: fg }} aria-hidden>
      <Icon className={cn("size-[19px]", iconClassName)} strokeWidth={1.9} />
    </span>
  );
}
