"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  COMPONENT_KEYS,
  HEALTH_WEIGHTS,
  BUFFER_TARGET_MONTHS,
  SAVINGS_TARGET_RATE,
  diffHealth,
  type ComponentKey,
  type HealthAction,
  type HealthResult,
} from "@compass/shared";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { useCategories } from "@/features/categories/use-categories";
import { useRealtimeInvalidate } from "@/features/realtime/use-realtime-invalidate";
import { useHealthSnapshots, useRefreshHealth } from "./use-health";

const STALE_AFTER_MS = 6 * 3_600_000;

export function scoreBand(score: number): "low" | "fair" | "good" {
  return score < 40 ? "low" : score < 70 ? "fair" : "good";
}

/** Half-circle gauge. The number and band are written out, so color is never the only cue. */
export function Gauge({ score }: { score: number }) {
  const { t } = useTranslation();
  const arc = "M 12 96 A 78 78 0 0 1 168 96";
  return (
    <div
      className="relative mx-auto w-full max-w-64"
      role="img"
      aria-label={`${score} / 100, ${t(`score.band_${scoreBand(score)}`)}`}
    >
      <svg viewBox="0 0 180 104" className="w-full">
        <path
          d={arc}
          pathLength={100}
          fill="none"
          stroke="var(--chart-grid)"
          strokeWidth={12}
          strokeLinecap="round"
        />
        <path
          d={arc}
          pathLength={100}
          fill="none"
          stroke="var(--chart-bar)"
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={`${Math.max(score, 0.5)} 100`}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className="text-4xl leading-none font-semibold tabular-nums">{score}</div>
        <div className="text-muted-foreground text-sm">{t(`score.band_${scoreBand(score)}`)}</div>
      </div>
    </div>
  );
}

function useActionText() {
  const { t, i18n } = useTranslation();
  const { data: categories } = useCategories();
  const lang = i18n.language;

  return (a: HealthAction): { text: string; href: string | null } => {
    const p = a.params;
    switch (a.id) {
      case "save_more":
        return {
          text: t("score.action_save_more", {
            ratePct: p.ratePct,
            targetPct: p.targetPct,
            amount: formatMoney(p.extraMonthly ?? 0, lang),
          }),
          href: "/goals",
        };
      case "set_budgets":
        return { text: t("score.action_set_budgets"), href: "/budgets" };
      case "fix_budget": {
        const cat = categories?.find((c) => c.id === p.categoryId);
        return {
          text: t("score.action_fix_budget", {
            count: p.overCount,
            category: cat ? (lang === "bn" ? cat.name_bn : cat.name_en) : "",
            amount: formatMoney(p.overBy ?? 0, lang),
          }),
          href: "/budgets",
        };
      }
      case "build_buffer":
        return {
          text: t("score.action_build_buffer", {
            months: p.months,
            target: p.targetMonths,
            amount: formatMoney(p.missing ?? 0, lang),
          }),
          href: "/goals",
        };
      case "smooth_income":
        return { text: t("score.action_smooth_income", { pct: p.variationPct }), href: null };
    }
  };
}

function componentDetail(
  t: (k: string, o?: Record<string, unknown>) => string,
  key: ComponentKey,
  c: HealthResult["components"][ComponentKey],
): string {
  if (!c.available) return t("score.not_enough_data");
  const raw = c.raw ?? 0;
  switch (key) {
    case "savings":
      return t("score.detail_savings", {
        pct: Math.round(raw * 100),
        target: SAVINGS_TARGET_RATE * 100,
      });
    case "budget":
      return raw === 0
        ? t("score.detail_budget_ok")
        : t("score.detail_budget_over", { count: raw });
    case "buffer":
      return t("score.detail_buffer", {
        months: (Math.round(raw * 10) / 10).toLocaleString(),
        target: BUFFER_TARGET_MONTHS,
      });
    case "stability":
      return t("score.detail_stability", { pct: Math.round(raw * 100) });
  }
}

export function ScoreView() {
  const { t, i18n } = useTranslation();
  const snapshots = useHealthSnapshots();
  const refresh = useRefreshHealth();
  const actionText = useActionText();
  const [refreshing, setRefreshing] = useState(false);
  const [triedOnce, setTriedOnce] = useState(false);
  const autoRefreshed = useRef(false);

  useRealtimeInvalidate("health_scores", [["health"]]);

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
  const changes = result && previous ? diffHealth(previous.breakdown, result) : [];
  const delta = latest && previous ? latest.score - previous.score : 0;

  return (
    <>
      <PageHeader title={t("score.title")} />

      {(snapshots.isPending || (refreshing && !latest)) && (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      )}
      {snapshots.isError && (
        <div>
          <p className="mb-2">{t("common.error")}</p>
          <Button onClick={() => void snapshots.refetch()}>{t("common.retry")}</Button>
        </div>
      )}

      {snapshots.isSuccess && !latest && triedOnce && !refreshing && (
        <section className="finance-card p-4 sm:p-5">
          <p className="mb-3 text-sm">{t("score.no_data")}</p>
          <Link href="/" className="text-primary text-sm">
            {t("nav.home")}
          </Link>
        </section>
      )}

      {latest && result && (
        <div className="space-y-4 pb-4">
          <section className="finance-card p-4 sm:p-5">
            <Gauge score={latest.score} />
            {previous && delta !== 0 && (
              <p className="mt-3 flex items-center justify-center gap-1 text-sm">
                {delta > 0 ? (
                  <ArrowUp className="size-4" aria-hidden />
                ) : (
                  <ArrowDown className="size-4" aria-hidden />
                )}
                {t(delta > 0 ? "score.up_since" : "score.down_since", { points: Math.abs(delta) })}
              </p>
            )}
            {result.confidence === "low" && (
              <p className="bg-muted mt-3 flex gap-2 rounded-lg p-2 text-xs" role="note">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {t("score.low_confidence")}
              </p>
            )}
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {t("score.updated", {
                  time: new Intl.DateTimeFormat(i18n.language === "bn" ? "bn-BD" : "en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Dhaka",
                  }).format(new Date(latest.computed_at)),
                })}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={refreshing}
                onClick={() => void runRefresh()}
              >
                {refreshing ? t("common.loading") : t("score.refresh")}
              </Button>
            </div>
          </section>

          <section className="finance-card p-4 sm:p-5">
            <h2 className="mb-3 font-medium">{t("score.breakdown")}</h2>
            <ul className="space-y-4">
              {COMPONENT_KEYS.map((k) => {
                const c = result.components[k];
                return (
                  <li key={k}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span>
                        {t(`score.component_${k}`)}
                        <span className="text-muted-foreground ml-1.5 text-xs">
                          {Math.round(HEALTH_WEIGHTS[k] * 100)}%
                        </span>
                      </span>
                      <span className="tabular-nums">{Math.round(c.score)}</span>
                    </div>
                    <div
                      className="bg-muted mt-1 h-2.5 rounded-r-full rounded-l-sm"
                      role="progressbar"
                      aria-label={t(`score.component_${k}`)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(c.score)}
                    >
                      <div
                        className="h-full rounded-r-full rounded-l-sm"
                        style={{
                          width: `${Math.max(c.score, 1.5)}%`,
                          background: "var(--chart-bar)",
                          opacity: c.available ? 1 : 0.45,
                        }}
                      />
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">{componentDetail(t, k, c)}</p>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="finance-card p-4 sm:p-5">
            <h2 className="mb-2 font-medium">{t("score.moved")}</h2>
            {!previous ? (
              <p className="text-muted-foreground text-sm">{t("score.moved_first")}</p>
            ) : changes.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("score.moved_none")}</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {changes.map((c) => (
                  <li key={c.component} className="flex items-center gap-2">
                    {c.points > 0 ? (
                      <ArrowUp className="size-4 shrink-0" aria-hidden />
                    ) : (
                      <ArrowDown className="size-4 shrink-0" aria-hidden />
                    )}
                    <span className="flex-1">
                      {t(`score.component_${c.component}`)}: {c.from} → {c.to}
                    </span>
                    <span className="tabular-nums">
                      {c.points > 0 ? "+" : "−"}
                      {Math.abs(c.points)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="finance-card p-4 sm:p-5">
            <h2 className="mb-2 font-medium">{t("score.actions")}</h2>
            {result.actions.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("score.actions_none")}</p>
            ) : (
              <ol className="space-y-3 text-sm">
                {result.actions.map((a, i) => {
                  const { text, href } = actionText(a);
                  return (
                    <li key={a.id} className="flex gap-3">
                      <span className="bg-muted flex size-6 shrink-0 items-center justify-center rounded-full text-xs">
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <p>{text}</p>
                        {href && (
                          <Link
                            href={href}
                            className="text-primary inline-flex min-h-11 items-center text-xs"
                          >
                            {t("score.take_action")}
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <p className="text-muted-foreground text-xs">{t("score.how")}</p>
        </div>
      )}
    </>
  );
}
