"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Period } from "@compass/shared";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { useAuth } from "@/features/auth/auth-provider";
import { useProfile } from "@/features/profile/use-profile";
import { ForecastCard } from "@/features/forecast/forecast-card";
import { HealthCard } from "@/features/health/health-card";
import { useAutoNudges } from "@/features/nudges/use-auto-nudges";
import { CategoryBars } from "./category-bars";
import { DemoLoader } from "./demo-loader";
import { PeriodTabs } from "./period-tabs";
import { TransactionList } from "./transaction-list";
import { useDashboard } from "./use-dashboard";
import { useTransactionList, useTransactionsRealtime } from "./use-transactions";
import { WeeklyChart } from "./weekly-chart";

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-muted-foreground text-xs">{hint}</div>}
    </div>
  );
}

export function Dashboard() {
  const { t, i18n } = useTranslation();
  const { userId } = useAuth();
  const profile = useProfile(userId);
  const [period, setPeriod] = useState<Period>("month");
  const { summary, byCategory, trend, balance } = useDashboard(period);
  const recent = useTransactionList(8);
  const lang = i18n.language;

  useTransactionsRealtime();
  useAutoNudges(recent.isSuccess && recent.data.length > 0);

  const noTransactions = recent.isSuccess && recent.data.length === 0;
  const hasSimulated = recent.data?.some((r) => r.is_simulated) ?? false;
  const net = (summary.data?.income ?? 0) - (summary.data?.expense ?? 0);

  return (
    <>
      <PageHeader title={t("app.name")} />

      {recent.isPending && <p className="text-muted-foreground">{t("common.loading")}</p>}
      {recent.isError && (
        <div>
          <p className="mb-2">{t("common.error")}</p>
          <Button onClick={() => void recent.refetch()}>{t("common.retry")}</Button>
        </div>
      )}

      {noTransactions && <DemoLoader suggested={profile.data?.income_type ?? null} />}

      {recent.isSuccess && !noTransactions && (
        <div className="space-y-4 pb-4">
          {hasSimulated && (
            <p className="text-muted-foreground text-xs">{t("common.simulated_note")}</p>
          )}

          <section aria-label={t("dashboard.balance")}>
            <div className="text-muted-foreground text-sm">{t("dashboard.balance")}</div>
            <div className="text-4xl font-semibold tabular-nums">
              {balance.data === undefined ? "…" : formatMoney(balance.data, lang)}
            </div>
          </section>

          <PeriodTabs value={period} onChange={setPeriod} />

          <div className="grid grid-cols-3 gap-2">
            <Tile
              label={t("dashboard.income")}
              value={formatMoney(summary.data?.income ?? 0, lang)}
            />
            <Tile
              label={t("dashboard.expense")}
              value={formatMoney(summary.data?.expense ?? 0, lang)}
            />
            <Tile label={t("dashboard.net")} value={formatSignedMoney(net, lang)} />
          </div>

          <ForecastCard />
          <HealthCard />

          {trend.data && <WeeklyChart data={trend.data} />}
          <CategoryBars data={byCategory.data ?? []} />

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-medium">{t("transactions.recent")}</h2>
              <div className="flex items-center gap-1">
                <Link
                  href="/transactions/new"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1")}
                >
                  <Plus className="size-4" aria-hidden />
                  {t("transactions.add_short")}
                </Link>
                <Link
                  href="/transactions"
                  className="text-primary min-h-10 content-center px-2 text-sm"
                >
                  {t("transactions.see_all")}
                </Link>
              </div>
            </div>
            <TransactionList rows={recent.data} />
          </section>
        </div>
      )}
    </>
  );
}
