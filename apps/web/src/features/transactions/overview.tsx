"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, type LucideIcon, Scale } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslation } from "react-i18next";
import type { Period } from "@compass/shared";
import { AnimatedNumber, SectionHeader } from "@/components/compass";
import { Skeleton } from "@/components/skeleton";
import { cn } from "@/lib/utils";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { CategoryBars } from "./category-bars";
import { PeriodTabs } from "./period-tabs";
import { useDashboard } from "./use-dashboard";

// Recharts is large; load it after the first paint instead of with the page.
const WeeklyChart = dynamic(() => import("./weekly-chart").then((m) => m.WeeklyChart), {
  ssr: false,
  loading: () => <Skeleton className="h-72 rounded-3xl" />,
});

function Totals({
  income,
  expense,
  lang,
  stale,
}: {
  income: number;
  expense: number;
  lang: string;
  /** the next period is still loading; the old figures stay, slightly dimmed */
  stale: boolean;
}) {
  const { t } = useTranslation();
  const net = income - expense;
  const cells: {
    label: string;
    value: number;
    format: (n: number) => string;
    icon: LucideIcon;
    tone: string;
  }[] = [
    {
      label: t("dashboard.income"),
      value: income,
      format: (n) => formatMoney(n, lang),
      icon: ArrowDownLeft,
      tone: "bg-positive-soft text-positive",
    },
    {
      label: t("dashboard.expense"),
      value: expense,
      format: (n) => formatMoney(n, lang),
      icon: ArrowUpRight,
      tone: "bg-negative-soft text-destructive",
    },
    {
      label: t("dashboard.net"),
      value: net,
      format: (n) => formatSignedMoney(Math.round(n), lang),
      icon: Scale,
      tone: "bg-secondary text-primary",
    },
  ];
  return (
    <div
      aria-busy={stale || undefined}
      className={cn(
        "finance-card grid grid-cols-3 divide-x divide-hairline py-4 transition-opacity duration-300",
        stale && "opacity-60",
      )}
    >
      {cells.map(({ label, value, format, icon: Icon, tone }) => (
        <div key={label} className="min-w-0 px-3 sm:px-5">
          <div className="flex items-center gap-1.5">
            <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", tone)}>
              <Icon className="size-3.5" strokeWidth={2.4} aria-hidden />
            </span>
            <span className="text-muted-foreground truncate text-[12px] font-semibold">
              {label}
            </span>
          </div>
          <AnimatedNumber
            value={value}
            format={format}
            className="mt-2 block truncate text-[15px] font-bold sm:text-xl"
          />
        </div>
      ))}
    </div>
  );
}

/** Income, spending and where it went for a week, month or three months. Lives on the Activity screen. */
export function Overview() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [period, setPeriod] = useState<Period>("month");
  const { summary, byCategory, trend } = useDashboard(period);

  return (
    <section
      aria-labelledby="period-heading"
      className="rise"
      style={{ "--i": 3 } as React.CSSProperties}
    >
      <SectionHeader id="period-heading" title={t("dashboard.overview")} className="items-center" />
      <div className="space-y-3">
        <PeriodTabs value={period} onChange={setPeriod} />
        <Totals
          income={summary.data?.income ?? 0}
          expense={summary.data?.expense ?? 0}
          lang={lang}
          stale={summary.isPlaceholderData}
        />
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {trend.data ? (
            <WeeklyChart data={trend.data} />
          ) : (
            <Skeleton className="h-72 rounded-3xl" />
          )}
          <div
            className={cn(
              "transition-opacity duration-300",
              byCategory.isPlaceholderData && "opacity-60",
            )}
          >
            <CategoryBars data={byCategory.data ?? []} />
          </div>
        </div>
      </div>
    </section>
  );
}
