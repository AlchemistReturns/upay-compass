"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Gauge, LineChart, ReceiptText, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Logo } from "@/components/compass";
import { NAV_ITEMS, isActivePath } from "@/components/bottom-nav";
import { NAV_TAB } from "@/components/page-transition";
import { cn } from "@/lib/utils";

const INSIGHTS = [
  { href: "/transactions", label: "nav.activity", icon: ReceiptText },
  { href: "/forecast", label: "forecast.title", icon: LineChart },
  { href: "/score", label: "score.title", icon: Gauge },
  { href: "/nudges", label: "nudges.title", icon: Bell },
] as const;

function Item({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      transitionTypes={NAV_TAB}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-2xl px-3.5 text-[14px] font-semibold transition-[background-color,color,box-shadow,transform] duration-200 active:scale-[0.98]",
        active
          ? "text-on-dark bg-[image:var(--gradient-teal)] shadow-[0_10px_24px_-14px_rgba(6,47,49,.8)]"
          : "text-muted-foreground hover:text-foreground hover:bg-white/80",
      )}
    >
      <Icon className={cn("size-[19px] shrink-0", active && "text-lime")} strokeWidth={2} />
      <span className="truncate">{label}</span>
    </Link>
  );
}

/** Desktop navigation. Phones and tablets use the floating tab bar instead. */
export function AppSidebar() {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <aside
      style={{ viewTransitionName: "app-sidebar" }}
      className="fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-w)] flex-col gap-7 border-r border-[rgba(13,75,76,.07)] bg-white/45 px-4 py-6 backdrop-blur-xl lg:flex"
    >
      <Logo className="px-2" />
      <nav aria-label={t("nav.label")} className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ href, key, icon }) => (
          <Item
            key={href}
            href={href}
            label={t(`nav.${key}`)}
            icon={icon}
            active={isActivePath(pathname, href)}
          />
        ))}
        <p className="text-muted-foreground mt-5 mb-1.5 px-3.5 text-[11px] font-bold tracking-[0.08em] uppercase">
          {t("nav.insights")}
        </p>
        {INSIGHTS.map(({ href, label, icon }) => (
          <Item
            key={href}
            href={href}
            label={t(label)}
            icon={icon}
            active={isActivePath(pathname, href)}
          />
        ))}
      </nav>
      <div className="balance-panel mt-auto rounded-3xl p-4 shadow-none">
        <ShieldCheck className="text-lime mb-2 size-5" aria-hidden />
        <p className="text-sm font-bold">{t("nav.edu_title")}</p>
        <p className="text-on-dark-muted mt-1 text-xs leading-5">{t("nav.edu_body")}</p>
      </div>
    </aside>
  );
}
