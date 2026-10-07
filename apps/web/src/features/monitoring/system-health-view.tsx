"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Coins,
  Eye,
  Gauge,
  Hourglass,
  LineChart,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Tags,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  HEALTH_RULES,
  PRICING_RETRIEVED,
  evaluateHealth,
  type MetricId,
  type Status,
} from "@compass/shared";
import { PageHeader } from "@/components/page-header";
import { Pill, EmptyState, ErrorState, LoadingCards } from "@/components/compass";
import { Segmented } from "@/components/segmented";
import { formatNumber, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { UsabilityEvidence } from "@/features/admin/usability-evidence";
import { METRIC_ORDER, buildCards, type CardModel } from "./present";
import { Sparkline } from "./sparkline";
import { useSystemHealth, type HealthWindow } from "./use-system-health";

const R = HEALTH_RULES;
const MINIMUMS: Record<MetricId, number> = {
  responding: R.responding.minCalls,
  ai_available: R.ai_available.minCalls,
  safety: R.safety.minChecked,
  accuracy: R.accuracy.minPayments,
  forecast: R.forecast.minPeople,
  cost: R.cost.minCalls,
};

const ICON: Record<MetricId, LucideIcon> = {
  responding: Gauge,
  ai_available: Sparkles,
  safety: ShieldCheck,
  accuracy: Tags,
  forecast: LineChart,
  cost: Coins,
};

/** Colour, icon and word together, so status never depends on colour alone. */
const STATUS: Record<
  Status,
  { icon: LucideIcon; pill: "good" | "warn" | "critical" | "muted"; hero: string }
> = {
  ok: { icon: CheckCircle2, pill: "good", hero: "bg-lime text-brand-ink" },
  watch: { icon: Eye, pill: "warn", hero: "bg-[#f4b24c] text-brand-ink" },
  problem: { icon: AlertTriangle, pill: "critical", hero: "bg-[#ff8068] text-brand-ink" },
  unknown: { icon: Hourglass, pill: "muted", hero: "bg-white/15 text-on-dark" },
};

const locale = (lang: string) => (lang === "bn" ? "bn-BD" : "en-US");

function StatusPill({ status }: { status: Status }) {
  const { t } = useTranslation();
  const { icon: Icon, pill } = STATUS[status];
  return (
    <Pill tone={pill} className="h-7 px-3 text-xs [&_svg]:size-3.5">
      <Icon aria-hidden />
      {t(`monitor.status.${status}`)}
    </Pill>
  );
}

function MetricCard({ card, index, range }: { card: CardModel; index: number; range: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const Icon = ICON[card.id];
  const hasNote = ["accuracy", "forecast", "cost"].includes(card.id) && card.status !== "unknown";
  return (
    <article
      aria-labelledby={`mon-${card.id}`}
      className="finance-card rise flex flex-col gap-3.5 p-5"
      style={{ "--i": index } as React.CSSProperties}
    >
      <div className="flex items-center gap-3">
        <span className="icon-chip">
          <Icon className="size-5" aria-hidden />
        </span>
        <h3 id={`mon-${card.id}`} className="text-[15px] leading-snug font-bold">
          {t(`monitor.cards.${card.id}.question`)}
        </h3>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="num text-[2.5rem] leading-none font-extrabold tracking-tight">
            {card.big}
            {card.id === "responding" && card.status !== "unknown" && (
              <span className="text-muted-foreground ms-1 text-xl font-bold">
                {t("monitor.unit_seconds")}
              </span>
            )}
          </p>
          <p className="text-muted-foreground mt-1.5 text-[13px] leading-snug">
            {t(card.caption.key, card.caption.params)}
          </p>
        </div>
        <StatusPill status={card.status} />
      </div>

      <p className="text-sm leading-6">{t(card.meaning.key, card.meaning.params)}</p>

      {card.series && (
        <Sparkline
          values={card.series}
          status={card.status}
          label={t("monitor.trend", { range })}
        />
      )}
      {hasNote && (
        <p className="text-muted-foreground text-xs leading-5">
          {t(`monitor.cards.${card.id}.note`, {
            date: formatShortDate(PRICING_RETRIEVED, lang),
          })}
        </p>
      )}
    </article>
  );
}

export function SystemHealthView() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [hours, setHours] = useState<HealthWindow>(24);

  const live = useSystemHealth(hours, true);
  const snapshot = live.data;
  const evaluated = useMemo(() => (snapshot ? evaluateHealth(snapshot) : null), [snapshot]);
  const cards = useMemo(
    () => (snapshot && evaluated ? buildCards(snapshot, evaluated.metrics, lang, MINIMUMS) : []),
    [snapshot, evaluated, lang],
  );

  const overall = evaluated?.overall ?? "unknown";
  const needAttention = (evaluated?.metrics ?? [])
    .filter((m) => m.status === "watch" || m.status === "problem")
    .sort((a, b) => METRIC_ORDER.indexOf(a.id) - METRIC_ORDER.indexOf(b.id))
    .map((m) => t(`monitor.cards.${m.id}.short`))
    .join(", ");
  const HeroIcon = STATUS[overall].icon;
  const range = t(hours === 24 ? "monitor.range_24h" : "monitor.range_7d");
  const allUnknown = evaluated?.metrics.every((m) => m.status === "unknown") ?? true;

  const updated = snapshot
    ? new Intl.DateTimeFormat(locale(lang), {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Dhaka",
      }).format(new Date(snapshot.generated_at))
    : null;

  return (
    <>
      <PageHeader
        title={t("monitor.title")}
        subtitle={t("monitor.subtitle")}
        icon={<Activity className="size-6" aria-hidden />}
        back="/"
      />

      <div className="mx-auto max-w-5xl space-y-4 pb-4">
        {/* controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Segmented
            label={t("monitor.range_label")}
            value={String(hours)}
            onSelect={(v) => setHours(v === "168" ? 168 : 24)}
            options={[
              { value: "24", label: t("monitor.range_24h") },
              { value: "168", label: t("monitor.range_7d") },
            ]}
            className="sm:w-60"
          />
          <div className="flex items-center gap-1">
            {
              <button
                type="button"
                onClick={() => void live.refetch()}
                disabled={live.isFetching}
                aria-label={t("monitor.refresh")}
                title={t("monitor.refresh")}
                className="bg-muted text-muted-foreground hover:text-foreground tap grid size-11 place-items-center rounded-full disabled:opacity-60"
              >
                <RefreshCw
                  className={cn("size-[18px]", live.isFetching && "animate-spin")}
                  aria-hidden
                />
              </button>
            }
          </div>
        </div>

        {live.isPending && <LoadingCards hero rows={4} />}
        {live.isError && <ErrorState onRetry={() => void live.refetch()} />}

        {snapshot && evaluated && (
          <>
            {/* the one verdict */}
            <section
              aria-labelledby="mon-hero"
              className="balance-panel rise flex items-start gap-4 p-5 sm:p-6"
            >
              <span
                className={cn(
                  "pop-spring grid size-14 shrink-0 place-items-center rounded-[1.1rem]",
                  STATUS[overall].hero,
                )}
              >
                <HeroIcon className="size-7" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 id="mon-hero" className="text-[1.375rem] leading-tight font-extrabold">
                  {t(`monitor.hero.${overall}`)}
                </h2>
                <p className="text-on-dark-muted mt-1.5 text-[15px] leading-6">
                  {overall === "watch" || overall === "problem"
                    ? t("monitor.hero.attention", { list: needAttention })
                    : t(`monitor.hero.${overall}_body`)}
                </p>
                <p className="text-on-dark-muted mt-2 text-xs">
                  {t("monitor.updated", {
                    time: updated,
                    count: snapshot.overall.calls,
                    formatted: formatNumber(snapshot.overall.calls, lang),
                  })}
                </p>
              </div>
            </section>

            {allUnknown ? (
              <EmptyState
                icon={Activity}
                title={t("monitor.empty_title")}
                body={t("monitor.empty_body")}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {cards.map((card, i) => (
                  <MetricCard key={card.id} card={card} index={i} range={range} />
                ))}
              </div>
            )}

            <p className="text-muted-foreground px-1 text-center text-xs leading-5">
              {t("monitor.privacy")}
            </p>
          </>
        )}

        <UsabilityEvidence />
      </div>
    </>
  );
}
