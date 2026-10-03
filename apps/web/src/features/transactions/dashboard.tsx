"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  LineChart,
  type LucideIcon,
  Plus,
  Scale,
  Sparkles,
  Target,
  Wallet,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Period } from "@compass/shared";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { useAuth } from "@/features/auth/auth-provider";
import { useProfile } from "@/features/profile/use-profile";
import { ForecastCard } from "@/features/forecast/forecast-card";
import { StreakChip } from "@/features/gamification/streak-chip";
import { HealthCard } from "@/features/health/health-card";
import { InstallPrompt } from "@/features/pwa/install-prompt";
import { useAutoNudges } from "@/features/nudges/use-auto-nudges";
import { DemoTools } from "@/features/demo/demo-tools";
import { CategoryBars } from "./category-bars";
import { DemoLoader } from "./demo-loader";
import { PeriodTabs } from "./period-tabs";
import { TransactionList } from "./transaction-list";
import { useDashboard } from "./use-dashboard";
import { useTransactionList, useTransactionsRealtime } from "./use-transactions";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/skeleton";

// Recharts is large; load it after the first paint instead of with the page.
const WeeklyChart = dynamic(() => import("./weekly-chart").then((m) => m.WeeklyChart), {
  ssr: false,
  loading: () => <Skeleton className="h-56" />,
});

function Tile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: "in" | "out" | "net";
}) {
  return (
    <div className="finance-card flex items-center gap-3 p-4 sm:block sm:p-5">
      <span
        className={cn(
          "icon-chip sm:mb-3",
          tone === "in" && "bg-positive-soft text-positive",
          tone === "out" && "bg-negative-soft text-destructive",
        )}
      >
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="text-muted-foreground text-xs font-medium">{label}</div>
        <div className="text-lg font-semibold tabular-nums sm:mt-0.5 sm:text-xl">{value}</div>
      </div>
    </div>
  );
}

/** Shortcut under the balance: icon tile, label below. `primary` is the solid white main action. */
function QuickAction({
  href,
  label,
  icon: Icon,
  primary = false,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-11 flex-col items-center gap-1.5 rounded-2xl text-center text-xs font-medium text-white/90 hover:text-white"
    >
      <span
        className={cn(
          "grid size-13 place-items-center rounded-[1.1rem] transition-colors",
          primary
            ? "text-brand-ink bg-white group-hover:bg-white/90"
            : "bg-white/12 ring-1 ring-white/20 group-hover:bg-white/20",
        )}
      >
        <Icon className="size-5" strokeWidth={primary ? 2.5 : 2} aria-hidden />
      </span>
      <span className="line-clamp-1">{label}</span>
    </Link>
  );
}

/** Entry point to the coach from home, so asking a question is one tap from the balance. */
function AskCoach() {
  const { t } = useTranslation();
  return (
    <Link
      href="/coach"
      className="finance-card flex items-center gap-3 rounded-[1.4rem] p-2.5 pl-3.5"
    >
      <span className="icon-chip">
        <Sparkles className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{t("dashboard.ask_coach")}</span>
        <span className="text-muted-foreground block truncate text-xs">
          “{t("coach.suggest_can_afford")}”
        </span>
      </span>
      <span className="bg-brand-ink grid size-11 shrink-0 place-items-center rounded-2xl text-white">
        <ChevronRight className="size-5" aria-hidden />
      </span>
    </Link>
  );
}

export function Dashboard() {
  const { t, i18n } = useTranslation();
  const { userId } = useAuth();
  const profile = useProfile(userId);
  const [period, setPeriod] = useState<Period>("month");
  const { summary, month, byCategory, trend, balance } = useDashboard(period);
  const recent = useTransactionList(8);
  const lang = i18n.language;

  useTransactionsRealtime();
  useAutoNudges(recent.isSuccess && recent.data.length > 0);

  const noTransactions = recent.isSuccess && recent.data.length === 0;
  const hasSimulated = recent.data?.some((r) => r.is_simulated) ?? false;
  const net = (summary.data?.income ?? 0) - (summary.data?.expense ?? 0);

  return (
    <>
      <PageHeader title={t("home.title")} />

      {recent.isPending && <p className="text-muted-foreground">{t("common.loading")}</p>}
      {recent.isError && (
        <div>
          <p className="mb-2">{t("common.error")}</p>
          <Button onClick={() => void recent.refetch()}>{t("common.retry")}</Button>
        </div>
      )}

      {noTransactions && (
        <div className="space-y-5 pb-4">
          <DemoLoader suggested={profile.data?.income_type ?? null} />
          <DemoTools />
        </div>
      )}

      {recent.isSuccess && !noTransactions && (
        <div className="space-y-5 pb-4 sm:space-y-6">
          <section aria-label={t("dashboard.balance")} className="balance-panel p-5 sm:p-7">
            <div className="relative z-[1]">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-medium text-white/80">{t("dashboard.balance")}</div>
                {hasSimulated && (
                  <span className="rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-medium text-white/90 ring-1 ring-white/20">
                    {t("demo.simulated_badge")}
                  </span>
                )}
              </div>
              <div className="mt-1.5 text-[2.5rem] leading-tight font-bold tracking-tight tabular-nums sm:text-5xl">
                {balance.data === undefined ? "…" : formatMoney(balance.data, lang)}
              </div>
              {month.data && (
                <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-white/80">
                  <span>{t("dashboard.this_month")}:</span>
                  <span className="font-semibold text-[#9be7b8] tabular-nums">
                    {t("dashboard.in_amount", {
                      amount: formatSignedMoney(month.data.income, lang),
                    })}
                  </span>
                  <span aria-hidden>·</span>
                  <span className="tabular-nums">
                    {t("dashboard.out_amount", { amount: formatMoney(month.data.expense, lang) })}
                  </span>
                </p>
              )}
              <nav
                aria-label={t("dashboard.quick_actions")}
                className="mt-6 grid max-w-md grid-cols-4 gap-2"
              >
                <QuickAction
                  href="/transactions/new"
                  label={t("transactions.add_short")}
                  icon={Plus}
                  primary
                />
                <QuickAction href="/forecast" label={t("dashboard.qa_forecast")} icon={LineChart} />
                <QuickAction href="/goals" label={t("nav.goals")} icon={Target} />
                <QuickAction href="/budgets" label={t("nav.budgets")} icon={Wallet} />
              </nav>
            </div>
          </section>
          {hasSimulated && (
            <p className="text-muted-foreground -mt-2 px-1 text-xs">{t("common.simulated_note")}</p>
          )}

          <AskCoach />

          <InstallPrompt />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <ForecastCard />
            <HealthCard />
            <StreakChip />
          </div>

          <section aria-labelledby="period-heading" className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 id="period-heading" className="section-title px-1">
                {t("dashboard.overview")}
              </h2>
              <PeriodTabs value={period} onChange={setPeriod} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Tile
                label={t("dashboard.income")}
                value={formatMoney(summary.data?.income ?? 0, lang)}
                icon={ArrowDownLeft}
                tone="in"
              />
              <Tile
                label={t("dashboard.expense")}
                value={formatMoney(summary.data?.expense ?? 0, lang)}
                icon={ArrowUpRight}
                tone="out"
              />
              <Tile
                label={t("dashboard.net")}
                value={formatSignedMoney(net, lang)}
                icon={Scale}
                tone="net"
              />
            </div>
          </section>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            {trend.data && <WeeklyChart data={trend.data} />}
            <CategoryBars data={byCategory.data ?? []} />
          </div>

          <section className="finance-card p-4 sm:p-5">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 className="section-title">{t("transactions.recent")}</h2>
              <div className="flex items-center gap-1">
                <Link
                  href="/transactions/new"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "gap-1 max-sm:hidden",
                  )}
                >
                  <Plus className="size-4" aria-hidden />
                  {t("transactions.add_short")}
                </Link>
                <Link
                  href="/transactions"
                  className="text-primary hover:bg-secondary min-h-11 content-center rounded-xl px-3 text-sm font-medium"
                >
                  {t("transactions.see_all")}
                </Link>
              </div>
            </div>
            <TransactionList rows={recent.data} framed={false} />
          </section>

          <DemoTools />
        </div>
      )}
    </>
  );
}
