"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  CircleCheck,
  Info,
  OctagonAlert,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader, TOOLBAR_BUTTON } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingCards, SectionHeader } from "@/components/compass";
import { formatMoney, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRealtimeInvalidate } from "@/features/realtime/use-realtime-invalidate";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/skeleton";
import { useLatestForecast, useRefreshForecast, type ForecastSnapshot } from "./use-forecast";

// Recharts is large; load it after the first paint instead of with the page.
const ForecastChart = dynamic(() => import("./forecast-chart").then((m) => m.ForecastChart), {
  ssr: false,
  loading: () => <Skeleton className="h-80 rounded-3xl" />,
});

const STALE_AFTER_MS = 6 * 3_600_000;

type Tone = "neutral" | "good" | "warn" | "critical";

function toneOf(snapshot: ForecastSnapshot): Tone {
  const d = snapshot.details;
  if (d.insufficient) return "neutral";
  if (!d.firstRiskDay || !d.lowest) return "good";
  return d.lowest.balance < 0 ? "critical" : "warn";
}

const TONE_STYLE: Record<Tone, { card: string; chip: string; Icon: typeof Info }> = {
  neutral: { card: "finance-card", chip: "bg-secondary text-primary", Icon: Info },
  good: { card: "surface-lime", chip: "bg-brand-ink text-lime", Icon: CircleCheck },
  warn: {
    card: "bg-warning-soft border border-[color-mix(in_oklab,var(--status-warning)_32%,transparent)]",
    chip: "bg-[#f7c35c] text-[#4d2f00]",
    Icon: TriangleAlert,
  },
  critical: {
    card: "bg-negative-soft border border-[color-mix(in_oklab,var(--destructive)_28%,transparent)]",
    chip: "bg-destructive text-white dark:text-[#3d0f05]",
    Icon: OctagonAlert,
  },
};

/** The one-line verdict, always with an icon and words (never color alone). */
export function ForecastStatus({ snapshot }: { snapshot: ForecastSnapshot }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const d = snapshot.details;
  const tone = toneOf(snapshot);
  const { chip, Icon } = TONE_STYLE[tone];
  let text: string;
  if (d.insufficient) text = t("forecast.insufficient");
  else if (!d.firstRiskDay || !d.lowest)
    text = t("forecast.status_ok", { buffer: formatMoney(d.safetyBuffer, lang) });
  else
    text = t(d.lowest.balance < 0 ? "forecast.status_negative" : "forecast.status_low", {
      day: formatShortDate(d.lowest.day, lang),
      amount: formatMoney(d.lowest.balance, lang),
      buffer: formatMoney(d.safetyBuffer, lang),
      first: formatShortDate(d.firstRiskDay, lang),
    });
  return (
    <div className="flex items-start gap-3.5">
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl", chip)}>
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="pt-0.5 text-[15px] leading-6 font-semibold">{text}</p>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[12px] font-semibold opacity-70">{label}</div>
      <div className="num mt-0.5 truncate text-[17px] font-extrabold">{value}</div>
      {sub && <div className="truncate text-[11.5px] opacity-70">{sub}</div>}
    </div>
  );
}

export function ForecastView() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const snapshot = useLatestForecast();
  const refresh = useRefreshForecast();
  const [refreshing, setRefreshing] = useState(false);
  const [triedOnce, setTriedOnce] = useState(false);
  const auto = useRef(false);

  useRealtimeInvalidate("forecasts", [["forecast"]]);

  async function run() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
    setTriedOnce(true);
  }

  // Open with a fresh forecast: recompute when there is none or it is more than 6 hours old.
  const latest = snapshot.data;
  useEffect(() => {
    if (!snapshot.isSuccess || auto.current) return;
    const stale = !latest || Date.now() - new Date(latest.computed_at).getTime() > STALE_AFTER_MS;
    if (stale) {
      auto.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- kicks off the one-time refresh
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.isSuccess, latest]);

  const d = latest?.details;
  const income = d?.recurring.filter((r) => r.direction === "in") ?? [];
  const payments = d?.recurring.filter((r) => r.direction === "out") ?? [];
  const end = latest?.projected_balance.at(-1)?.balance;
  const tone = latest ? toneOf(latest) : "neutral";

  return (
    <>
      <PageHeader
        title={t("forecast.title")}
        back="/"
        actions={
          latest && (
            <button
              type="button"
              className={TOOLBAR_BUTTON}
              aria-label={t("score.refresh")}
              title={t("score.refresh")}
              disabled={refreshing}
              aria-busy={refreshing || undefined}
              onClick={() => void run()}
            >
              <RefreshCw className="ic-refresh size-[18px]" aria-hidden />
            </button>
          )
        }
      />

      {(snapshot.isPending || (refreshing && !latest)) && <LoadingCards hero rows={2} />}
      {snapshot.isError && <ErrorState onRetry={() => void snapshot.refetch()} />}
      {snapshot.isSuccess && !latest && triedOnce && !refreshing && (
        <EmptyState
          icon={CalendarClock}
          body={t("forecast.no_data")}
          action={
            <Link href="/" className="text-primary text-sm font-semibold">
              {t("nav.home")}
            </Link>
          }
        />
      )}

      {latest && d && (
        <div className="space-y-7 pb-4">
          <div className="space-y-3">
            <section className={cn("rise rounded-[1.75rem] p-5 sm:p-6", TONE_STYLE[tone].card)}>
              <ForecastStatus snapshot={latest} />
              {!d.insufficient && (
                <div className="mt-5 grid grid-cols-3 gap-3 border-t border-current/10 pt-4">
                  <Stat label={t("forecast.today")} value={formatMoney(d.startBalance, lang)} />
                  <Stat
                    label={t("forecast.lowest")}
                    value={d.lowest ? formatMoney(d.lowest.balance, lang) : "–"}
                    sub={d.lowest ? formatShortDate(d.lowest.day, lang) : undefined}
                  />
                  <Stat
                    label={t("forecast.in_30")}
                    value={end !== undefined ? formatMoney(end, lang) : "–"}
                  />
                </div>
              )}
            </section>
            {!d.insufficient && d.confidence === "low" && (
              <p className="callout" role="note">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t("forecast.low_confidence")}
              </p>
            )}
          </div>

          {!d.insufficient && (
            <>
              <ForecastChart snapshot={latest} />

              <section aria-labelledby="expect-heading">
                <SectionHeader
                  id="expect-heading"
                  title={t("forecast.expect_title")}
                  hint={t("forecast.expect_hint", {
                    income: formatMoney(d.expectedIncome, lang),
                    bills: formatMoney(d.expectedBills, lang),
                  })}
                />
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    { title: t("forecast.expect_income"), list: income, incoming: true },
                    { title: t("forecast.expect_payments"), list: payments, incoming: false },
                  ].map(
                    ({ title, list, incoming }) =>
                      list.length > 0 && (
                        <div key={title} className="finance-card p-2.5">
                          <h3 className="text-muted-foreground px-2 pt-1.5 pb-1 text-xs font-bold tracking-wide uppercase">
                            {title}
                          </h3>
                          <ul className="divide-y divide-hairline">
                            {list.map((r) => (
                              <li
                                key={`${r.counterparty}-${r.nextDay}`}
                                className="flex items-center gap-3 px-2 py-3"
                              >
                                <span
                                  className={cn(
                                    "icon-chip size-10 rounded-xl",
                                    incoming
                                      ? "bg-positive-soft text-positive"
                                      : "bg-secondary text-primary",
                                  )}
                                >
                                  {incoming ? (
                                    <ArrowDownLeft className="size-[18px]" aria-hidden />
                                  ) : (
                                    <ArrowUpRight className="size-[18px]" aria-hidden />
                                  )}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-semibold">
                                    {r.counterparty}
                                  </div>
                                  <div className="text-muted-foreground text-xs">
                                    {t(`forecast.cadence_${r.cadence}`)} ·{" "}
                                    {t("forecast.next", { date: formatShortDate(r.nextDay, lang) })}
                                  </div>
                                </div>
                                <div
                                  className={cn(
                                    "num text-sm font-bold",
                                    incoming && "text-positive",
                                  )}
                                >
                                  {r.amountStable ? "" : "~"}
                                  {formatMoney(r.expectedAmount, lang)}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ),
                  )}
                </div>
                {d.recurring.some((r) => !r.amountStable) && (
                  <p className="text-muted-foreground mt-3 px-1 text-xs leading-5">
                    {t("forecast.estimated_note")}
                  </p>
                )}
              </section>

              <div className="space-y-2 px-1">
                {d.backtest && (
                  <p className="text-muted-foreground text-xs leading-5">
                    {t("forecast.backtest", {
                      pct: Math.max(0, d.backtest.improvementPct),
                      mae: formatMoney(d.backtest.mae, lang),
                      naive: formatMoney(d.backtest.naiveMae, lang),
                    })}
                  </p>
                )}
                <p className="text-muted-foreground text-xs leading-5">{t("forecast.how")}</p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
