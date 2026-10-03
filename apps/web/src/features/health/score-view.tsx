"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Info,
  Landmark,
  PiggyBank,
  RefreshCw,
  Scale,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
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
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCategories } from "@/features/categories/use-categories";
import { useRealtimeInvalidate } from "@/features/realtime/use-realtime-invalidate";
import { useHealthSnapshots, useRefreshHealth } from "./use-health";

const STALE_AFTER_MS = 6 * 3_600_000;

const COMPONENT_ICON: Record<ComponentKey, LucideIcon> = {
  savings: PiggyBank,
  budget: Scale,
  buffer: ShieldCheck,
  stability: Landmark,
};

export function scoreBand(score: number): "low" | "fair" | "good" {
  return score < 40 ? "low" : score < 70 ? "fair" : "good";
}

const BAND_TONE = { low: "critical", fair: "warn", good: "lime" } as const;

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

function ScoreHero({
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
            onClick={onRefresh}
          >
            <RefreshCw className={cn(refreshing && "animate-spin")} aria-hidden />
            {refreshing ? t("common.loading") : t("score.refresh")}
          </Button>
        </div>
      </div>
    </section>
  );
}

export function ScoreView() {
  const { t } = useTranslation();
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
      <PageHeader title={t("score.title")} back="/" />

      {(snapshots.isPending || (refreshing && !latest)) && <LoadingCards hero rows={2} />}
      {snapshots.isError && <ErrorState onRetry={() => void snapshots.refetch()} />}

      {snapshots.isSuccess && !latest && triedOnce && !refreshing && (
        <EmptyState
          icon={Info}
          body={t("score.no_data")}
          action={
            <Link href="/" className="text-primary text-sm font-semibold">
              {t("nav.home")}
            </Link>
          }
        />
      )}

      {latest && result && (
        <div className="space-y-7 pb-4">
          <div className="space-y-3">
            <ScoreHero
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
                {t("score.low_confidence")}
              </p>
            )}
          </div>

          <section aria-labelledby="breakdown">
            <SectionHeader id="breakdown" title={t("score.breakdown")} />
            <ul className="grid gap-3 sm:grid-cols-2">
              {COMPONENT_KEYS.map((k, i) => {
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
                          {t(`score.component_${k}`)}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {Math.round(HEALTH_WEIGHTS[k] * 100)}%
                        </div>
                      </div>
                      <div className="num text-[1.375rem] font-extrabold">
                        {Math.round(c.score)}
                      </div>
                    </div>
                    <ProgressBar
                      className="mt-3"
                      value={c.score}
                      label={t(`score.component_${k}`)}
                      color={
                        c.available ? "var(--leaf)" : "color-mix(in oklch, var(--leaf) 45%, white)"
                      }
                    />
                    <p className="text-muted-foreground mt-2.5 text-[12.5px] leading-5">
                      {componentDetail(t, k, c)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="actions-heading">
            <SectionHeader id="actions-heading" title={t("score.actions")} />
            {result.actions.length === 0 ? (
              <p className="finance-card text-muted-foreground p-4 text-sm">
                {t("score.actions_none")}
              </p>
            ) : (
              <ol className="space-y-2.5">
                {result.actions.map((a, i) => {
                  const { text, href } = actionText(a);
                  const body = (
                    <>
                      <span className="bg-lime text-brand-ink num grid size-8 shrink-0 place-items-center rounded-full text-sm font-extrabold">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 text-sm leading-6">{text}</span>
                      {href && (
                        <span className="bg-secondary text-primary grid size-9 shrink-0 place-items-center self-center rounded-full">
                          <ArrowRight className="size-4" aria-hidden />
                          <span className="sr-only">{t("score.take_action")}</span>
                        </span>
                      )}
                    </>
                  );
                  return (
                    <li key={a.id}>
                      {href ? (
                        <Link href={href} className="finance-card flex items-start gap-3 p-4">
                          {body}
                        </Link>
                      ) : (
                        <div className="finance-card flex items-start gap-3 p-4">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section aria-labelledby="moved-heading">
            <SectionHeader id="moved-heading" title={t("score.moved")} />
            <div className="finance-card p-4">
              {!previous ? (
                <p className="text-muted-foreground text-sm">{t("score.moved_first")}</p>
              ) : changes.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("score.moved_none")}</p>
              ) : (
                <ul className="divide-y divide-[rgba(13,75,76,.07)] text-sm">
                  {changes.map((c) => (
                    <li
                      key={c.component}
                      className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <span
                        className={cn(
                          "grid size-7 shrink-0 place-items-center rounded-full",
                          c.points > 0
                            ? "bg-positive-soft text-positive"
                            : "bg-negative-soft text-destructive",
                        )}
                      >
                        {c.points > 0 ? (
                          <ArrowUp className="size-3.5" aria-hidden />
                        ) : (
                          <ArrowDown className="size-3.5" aria-hidden />
                        )}
                      </span>
                      <span className="flex-1">
                        {t(`score.component_${c.component}`)}
                        <span className="text-muted-foreground num ml-1.5 text-xs">
                          {c.from} → {c.to}
                        </span>
                      </span>
                      <span className="num font-bold">
                        {c.points > 0 ? "+" : "−"}
                        {Math.abs(c.points)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <p className="text-muted-foreground px-1 text-xs leading-5">{t("score.how")}</p>
        </div>
      )}
    </>
  );
}
