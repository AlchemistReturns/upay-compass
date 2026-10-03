"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  CalendarCheck,
  Info,
  Landmark,
  PiggyBank,
  RefreshCw,
  Scale,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  READINESS_KEYS,
  READINESS_WEIGHTS,
  diffReadiness,
  type ReadinessKey,
  type ReadinessResult,
} from "@compass/shared";
import { PageHeader } from "@/components/page-header";
import {
  EmptyState,
  ErrorState,
  LoadingCards,
  Pill,
  ProgressBar,
  Ring,
  SectionHeader,
  useCountUp,
} from "@/components/compass";
import { Button } from "@/components/ui/button";
import { ScoreMoved } from "@/features/health/score-moved";
import { scoreBand } from "@/features/health/score-view";
import { useRealtimeInvalidate } from "@/features/realtime/use-realtime-invalidate";
import { useReadinessSnapshots, useRefreshReadiness } from "./use-readiness";

const STALE_AFTER_MS = 6 * 3_600_000;
const BAND_TONE = { low: "critical", fair: "warn", good: "lime" } as const;

const COMPONENT_ICON: Record<ReadinessKey, LucideIcon> = {
  income: Landmark,
  punctuality: CalendarCheck,
  savings: PiggyBank,
  budget: Scale,
};

function componentDetail(
  t: (k: string, o?: Record<string, unknown>) => string,
  key: ReadinessKey,
  c: ReadinessResult["components"][ReadinessKey],
): string {
  const d = c.detail;
  switch (key) {
    case "income":
      return c.available
        ? t("score.detail_stability", { pct: Math.round((c.raw ?? 0) * 100) })
        : t("readiness.need_income");
    case "punctuality":
      return c.available
        ? t("readiness.detail_punctuality", {
            onTime: d.onTime,
            payments: d.payments,
            bills: d.bills,
          })
        : t("readiness.need_bills");
    case "savings":
      return c.available
        ? t("readiness.detail_savings", { active: d.active, observed: d.observed })
        : t("readiness.need_months");
    case "budget":
      return !c.available
        ? t("readiness.need_budgets")
        : (c.raw ?? 0) === 0
          ? t("score.detail_budget_ok")
          : t("score.detail_budget_over", { count: c.raw });
  }
}

/** The standing notice. Static text, rendered before any data arrives, and never dismissible. */
function InformationalBanner() {
  const { t } = useTranslation();
  return (
    <p className="callout" role="note" data-testid="readiness-disclaimer">
      <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        <strong>{t("readiness.disclaimer_lead")}</strong> {t("readiness.disclaimer")}
      </span>
    </p>
  );
}

function Hero({
  score,
  delta,
  hasPrevious,
  computedAt,
  refreshing,
  onRefresh,
}: {
  score: number;
  delta: number;
  hasPrevious: boolean;
  computedAt: string;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { t, i18n } = useTranslation();
  const band = scoreBand(score);
  const shown = Math.round(useCountUp(score, 1000));

  return (
    <section className="balance-panel rise p-5 sm:p-7">
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-8">
        <Ring value={score} size={176} stroke={14} track="rgba(255,255,255,.1)" color="var(--lime)">
          <div role="img" aria-label={`${score} / 100, ${t(`score.band_${band}`)}`}>
            <div className="num text-[3.25rem] leading-none font-extrabold" aria-hidden>
              {shown}
            </div>
            <div className="text-on-dark-muted mt-1 text-xs font-semibold" aria-hidden>
              {t("score.out_of")}
            </div>
          </div>
        </Ring>
        <div className="flex min-w-0 flex-1 flex-col items-center text-center sm:items-start sm:text-left">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <Pill tone={BAND_TONE[band]} className="h-7 px-3 text-[13px]">
              {t(`score.band_${band}`)}
            </Pill>
            {hasPrevious && delta !== 0 && (
              <Pill tone="dark" className="h-7 px-3 text-[12.5px]">
                {delta > 0 ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />}
                {t(delta > 0 ? "score.up_since" : "score.down_since", { points: Math.abs(delta) })}
              </Pill>
            )}
          </div>
          <p className="text-on-dark-muted mt-3 max-w-sm text-[13px] leading-5">
            {t("score.updated", {
              time: new Intl.DateTimeFormat(i18n.language === "bn" ? "bn-BD" : "en-GB", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Asia/Dhaka",
              }).format(new Date(computedAt)),
            })}
          </p>
          <Button
            variant="darkGhost"
            size="sm"
            className="mt-4"
            disabled={refreshing}
            aria-busy={refreshing || undefined}
            onClick={onRefresh}
          >
            <RefreshCw className="ic-refresh" aria-hidden />
            {refreshing ? t("common.loading") : t("score.refresh")}
          </Button>
        </div>
      </div>
    </section>
  );
}

export function ReadinessView() {
  const { t } = useTranslation();
  const snapshots = useReadinessSnapshots();
  const refresh = useRefreshReadiness();
  const [refreshing, setRefreshing] = useState(false);
  const [triedOnce, setTriedOnce] = useState(false);
  const autoRefreshed = useRef(false);

  useRealtimeInvalidate("readiness_scores", [["readiness"]]);

  const latest = snapshots.data?.[0];
  const previous = snapshots.data?.[1];

  async function runRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
    setTriedOnce(true);
  }

  // Open with a fresh score: recompute when there is none or it is more than 6 hours old.
  useEffect(() => {
    if (!snapshots.isSuccess || autoRefreshed.current) return;
    const stale = !latest || Date.now() - new Date(latest.computed_at).getTime() > STALE_AFTER_MS;
    if (stale) {
      autoRefreshed.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- kicks off the one-time refresh
      void runRefresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshots.isSuccess, latest]);

  const result = latest?.breakdown;
  const changes = result && previous ? diffReadiness(previous.breakdown, result) : [];
  const delta = latest && previous ? latest.score - previous.score : 0;

  return (
    <>
      <PageHeader title={t("readiness.title")} back="/" />
      <div className="space-y-7 pb-4">
        <InformationalBanner />

        {(snapshots.isPending || (refreshing && !latest)) && <LoadingCards hero rows={2} />}
        {snapshots.isError && <ErrorState onRetry={() => void snapshots.refetch()} />}

        {snapshots.isSuccess && !latest && triedOnce && !refreshing && (
          <EmptyState
            icon={Info}
            body={t("readiness.no_data")}
            action={
              <Link
                href="/"
                className="text-primary inline-flex min-h-11 items-center text-sm font-semibold"
              >
                {t("nav.home")}
              </Link>
            }
          />
        )}

        {latest && result && (
          <>
            <div className="space-y-3">
              <Hero
                score={latest.score}
                delta={delta}
                hasPrevious={Boolean(previous)}
                computedAt={latest.computed_at}
                refreshing={refreshing}
                onRefresh={() => void runRefresh()}
              />
              {result.confidence === "low" && (
                <p className="callout" role="note">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {t("readiness.low_confidence")}
                </p>
              )}
            </div>

            <section aria-labelledby="readiness-breakdown">
              <SectionHeader id="readiness-breakdown" title={t("score.breakdown")} />
              <ul className="grid gap-3 sm:grid-cols-2">
                {READINESS_KEYS.map((k, i) => {
                  const c = result.components[k];
                  const Icon = COMPONENT_ICON[k];
                  return (
                    <li
                      key={k}
                      className="finance-card rise p-4"
                      style={{ "--i": i + 1 } as React.CSSProperties}
                    >
                      <div className="flex items-center gap-3">
                        <span className="icon-chip size-10 rounded-xl">
                          <Icon className="size-[18px]" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold">
                            {t(`readiness.component_${k}`)}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {Math.round(READINESS_WEIGHTS[k] * 100)}%
                          </div>
                        </div>
                        <div className="num text-[1.375rem] font-extrabold">
                          {Math.round(c.score)}
                        </div>
                      </div>
                      <ProgressBar
                        className="mt-3"
                        value={c.score}
                        label={t(`readiness.component_${k}`)}
                        color={
                          c.available
                            ? "var(--leaf)"
                            : "color-mix(in oklch, var(--leaf) 45%, white)"
                        }
                      />
                      <p className="text-muted-foreground mt-2.5 text-[12.5px] leading-5">
                        {componentDetail(t, k, c)}
                      </p>
                      {k === "punctuality" && c.available && (
                        <p className="text-muted-foreground mt-1.5 text-[12px] leading-5 italic">
                          {t("readiness.punctuality_proxy")}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            <ScoreMoved
              id="readiness-moved"
              hasPrevious={Boolean(previous)}
              changes={changes}
              label={(k) => t(`readiness.component_${k}`)}
            />

            <p className="text-muted-foreground px-1 text-xs leading-5">{t("readiness.how")}</p>
          </>
        )}
      </div>
    </>
  );
}
