"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { formatMoney, formatShortDate } from "@/lib/format";
import { useRealtimeInvalidate } from "@/features/realtime/use-realtime-invalidate";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/skeleton";

// Recharts is large; load it after the first paint instead of with the page.
const ForecastChart = dynamic(() => import("./forecast-chart").then((m) => m.ForecastChart), {
  ssr: false,
  loading: () => <Skeleton className="h-64" />,
});
import { useLatestForecast, useRefreshForecast, type ForecastSnapshot } from "./use-forecast";

const STALE_AFTER_MS = 6 * 3_600_000;

/** The one-line verdict, always with an icon and words (never color alone). */
export function ForecastStatus({ snapshot }: { snapshot: ForecastSnapshot }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const d = snapshot.details;
  if (d.insufficient) {
    return (
      <p className="flex items-start gap-2 text-sm">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t("forecast.insufficient")}
      </p>
    );
  }
  if (!d.firstRiskDay || !d.lowest) {
    return (
      <p className="flex items-start gap-2 text-sm">
        <CheckCircle2
          className="mt-0.5 size-4 shrink-0"
          style={{ color: "var(--status-good)" }}
          aria-hidden
        />
        {t("forecast.status_ok", { buffer: formatMoney(d.safetyBuffer, lang) })}
      </p>
    );
  }
  const negative = d.lowest.balance < 0;
  const Icon = negative ? OctagonAlert : AlertTriangle;
  return (
    <p className="flex items-start gap-2 text-sm">
      <Icon
        className="mt-0.5 size-4 shrink-0"
        style={{ color: negative ? "var(--status-critical)" : "var(--status-warning)" }}
        aria-hidden
      />
      <span>
        {t(negative ? "forecast.status_negative" : "forecast.status_low", {
          day: formatShortDate(d.lowest.day, lang),
          amount: formatMoney(d.lowest.balance, lang),
          buffer: formatMoney(d.safetyBuffer, lang),
          first: formatShortDate(d.firstRiskDay, lang),
        })}
      </span>
    </p>
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

  return (
    <>
      <PageHeader title={t("forecast.title")} />

      {(snapshot.isPending || (refreshing && !latest)) && (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      )}
      {snapshot.isError && (
        <div>
          <p className="mb-2">{t("common.error")}</p>
          <Button onClick={() => void snapshot.refetch()}>{t("common.retry")}</Button>
        </div>
      )}
      {snapshot.isSuccess && !latest && triedOnce && !refreshing && (
        <p className="text-sm">
          {t("forecast.no_data")}{" "}
          <Link href="/" className="text-primary">
            {t("nav.home")}
          </Link>
        </p>
      )}

      {latest && d && (
        <div className="space-y-4 pb-4">
          <section className="rounded-xl border p-4">
            <ForecastStatus snapshot={latest} />
            {!d.insufficient && d.confidence === "low" && (
              <p className="bg-muted mt-3 flex gap-2 rounded-lg p-2 text-xs" role="note">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {t("forecast.low_confidence")}
              </p>
            )}
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t("common.simulated_note")}</span>
              <Button size="sm" variant="ghost" disabled={refreshing} onClick={() => void run()}>
                {refreshing ? t("common.loading") : t("score.refresh")}
              </Button>
            </div>
          </section>

          {!d.insufficient && (
            <>
              <ForecastChart snapshot={latest} />

              <section className="rounded-xl border p-4">
                <h2 className="mb-2 font-medium">{t("forecast.expect_title")}</h2>
                <p className="text-muted-foreground mb-3 text-xs">
                  {t("forecast.expect_hint", {
                    income: formatMoney(d.expectedIncome, lang),
                    bills: formatMoney(d.expectedBills, lang),
                  })}
                </p>
                {[
                  { title: t("forecast.expect_income"), list: income },
                  { title: t("forecast.expect_payments"), list: payments },
                ].map(
                  ({ title, list }) =>
                    list.length > 0 && (
                      <div key={title} className="mb-3 last:mb-0">
                        <h3 className="text-muted-foreground mb-1 text-xs">{title}</h3>
                        <ul className="divide-y rounded-lg border text-sm">
                          {list.map((r) => (
                            <li
                              key={`${r.counterparty}-${r.nextDay}`}
                              className="flex items-center gap-3 px-3 py-2"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="truncate">{r.counterparty}</div>
                                <div className="text-muted-foreground text-xs">
                                  {t(`forecast.cadence_${r.cadence}`)} ·{" "}
                                  {t("forecast.next", { date: formatShortDate(r.nextDay, lang) })}
                                </div>
                              </div>
                              <div className="text-right tabular-nums">
                                {r.amountStable ? "" : "~"}
                                {formatMoney(r.expectedAmount, lang)}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ),
                )}
                {d.recurring.some((r) => !r.amountStable) && (
                  <p className="text-muted-foreground text-xs">{t("forecast.estimated_note")}</p>
                )}
              </section>

              {d.backtest && (
                <p className="text-muted-foreground text-xs">
                  {t("forecast.backtest", {
                    pct: Math.max(0, d.backtest.improvementPct),
                    mae: formatMoney(d.backtest.mae, lang),
                    naive: formatMoney(d.backtest.naiveMae, lang),
                  })}
                </p>
              )}
              <p className="text-muted-foreground text-xs">{t("forecast.how")}</p>
            </>
          )}
        </div>
      )}
    </>
  );
}
