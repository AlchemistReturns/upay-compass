"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowRight,
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
import {
  AnimatedNumber,
  EmptyState,
  ErrorState,
  LoadingCards,
  Pill,
  Ring,
  SectionHeader,
} from "@/components/compass";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { useAuth } from "@/features/auth/auth-provider";
import { useProfile } from "@/features/profile/use-profile";
import { BAND_COLOR } from "@/features/health/health-card";
import { useHealthSnapshots } from "@/features/health/use-health";
import { useReadinessSnapshots } from "@/features/readiness/use-readiness";
import { useRealtimeInvalidate } from "@/features/realtime/use-realtime-invalidate";
import { GetStarted } from "@/features/onboarding/get-started";
import { VoiceTryButton } from "@/features/voice/voice-command-button";
import { InstallPrompt } from "@/features/pwa/install-prompt";
import { useAutoNudges } from "@/features/nudges/use-auto-nudges";
import { CategoryBars } from "./category-bars";
import { PeriodTabs } from "./period-tabs";
import { TransactionList } from "./transaction-list";
import { useDashboard } from "./use-dashboard";
import { useTransactionList, useTransactionsRealtime } from "./use-transactions";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/skeleton";
import { NAV_FORWARD } from "@/components/page-transition";

// Recharts is large; load it after the first paint instead of with the page.
const WeeklyChart = dynamic(() => import("./weekly-chart").then((m) => m.WeeklyChart), {
  ssr: false,
  loading: () => <Skeleton className="h-72 rounded-3xl" />,
});

/** Greeting for the hour in Bangladesh, plus today's date for the eyebrow. Client-only. */
function useGreeting() {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState<Date | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the clock is read after mount
  useEffect(() => setNow(new Date()), []);
  if (!now) return { greeting: t("home.title"), date: undefined };
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Dhaka",
    }).format(now),
  );
  const key = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const date = new Intl.DateTimeFormat(i18n.language === "bn" ? "bn-BD" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Dhaka",
  }).format(now);
  return { greeting: t(`home.greeting_${key}`), date };
}

/** Round shortcut on the balance panel. `primary` is the lime main action. */
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
      // adding and the forecast go deeper; goals and budgets are tabs
      transitionTypes={
        href === "/transactions/new" || href === "/forecast" ? NAV_FORWARD : undefined
      }
      className="group text-on-dark/90 flex min-w-0 flex-col items-center gap-2 text-center text-[12px] font-semibold hover:text-white"
    >
      <span
        className={cn(
          "grid size-[3.25rem] place-items-center rounded-full transition-[background-color,scale] duration-500 ease-[var(--ease-spring)] group-active:scale-90 group-active:duration-100",
          primary
            ? "bg-lime text-brand-ink shadow-[0_10px_22px_-10px_rgba(195,234,140,.9)] group-hover:bg-[#cff09e]"
            : "bg-white/10 ring-1 ring-white/15 group-hover:bg-white/18",
        )}
      >
        <Icon
          className={cn("size-[21px]", primary ? "ic-add" : "ic-pop")}
          strokeWidth={primary ? 2.5 : 2}
          aria-hidden
        />
      </span>
      <span className="w-full truncate">{label}</span>
    </Link>
  );
}

/** One score on the balance panel (health or credit readiness); opens its full screen. */
function ScoreStat({
  href,
  label,
  note,
  score,
}: {
  href: string;
  label: string;
  /** small line under the band, e.g. "Informational only" */
  note?: string;
  score: number | undefined;
}) {
  const { t } = useTranslation();
  const band = score === undefined ? null : score < 40 ? "low" : score < 70 ? "fair" : "good";
  return (
    <Link
      href={href}
      transitionTypes={NAV_FORWARD}
      className="group flex min-w-0 items-center gap-2.5 rounded-2xl bg-white/8 p-2.5 ring-1 ring-white/12 transition-colors hover:bg-white/14"
    >
      {/* the arc is decorative; the number and band are written out */}
      <Ring
        value={score ?? 0}
        size={42}
        stroke={5}
        track="rgba(255,255,255,.14)"
        color={band ? BAND_COLOR[band] : "transparent"}
      >
        <span className="num text-[14px] font-extrabold">{score ?? "–"}</span>
      </Ring>
      <div className="min-w-0 flex-1">
        <div className="text-on-dark-muted truncate text-[12px] font-semibold">{label}</div>
        <div className="mt-0.5 truncate text-[14px] font-bold">
          {band ? t(`score.band_${band}`) : t("dashboard.score_pending")}
        </div>
        {note && <div className="text-on-dark-muted truncate text-[11px]">{note}</div>}
      </div>
      <ChevronRight
        className="ic-forward text-on-dark-muted hidden size-4 shrink-0 group-hover:text-white sm:block"
        aria-hidden
      />
    </Link>
  );
}

function BalancePanel({
  balance,
  income,
  expense,
  simulated,
}: {
  balance: number | undefined;
  income: number | undefined;
  expense: number | undefined;
  simulated: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const health = useHealthSnapshots();
  const readiness = useReadinessSnapshots();
  useRealtimeInvalidate("health_scores", [["health"]]);
  useRealtimeInvalidate("readiness_scores", [["readiness"]]);
  const spentPct =
    income && income > 0 && expense !== undefined
      ? Math.min(Math.round((expense / income) * 100), 100)
      : null;

  return (
    <section
      aria-label={t("dashboard.balance")}
      className="balance-panel rise flex flex-col p-5 sm:p-7"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-on-dark-muted flex items-center gap-2 text-[13px] font-semibold">
          <Wallet className="text-lime size-4" aria-hidden />
          {t("dashboard.balance")}
        </div>
        {simulated && <Pill tone="dark">{t("demo.simulated_badge")}</Pill>}
      </div>

      <div className="mt-2 text-[2.75rem] leading-none font-extrabold tracking-[-0.035em] sm:text-[3.25rem]">
        {balance === undefined ? (
          <span className="inline-block h-11 w-48 animate-pulse rounded-xl bg-white/10 align-middle" />
        ) : (
          <AnimatedNumber value={balance} format={(n) => formatMoney(n, lang)} />
        )}
      </div>

      {income !== undefined && expense !== undefined && (
        <div className="mt-5 lg:mb-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
            <span className="text-on-dark-muted">{t("dashboard.this_month")}</span>
            <span className="flex items-center gap-1 font-semibold">
              <ArrowDownLeft className="text-lime size-3.5" aria-hidden />
              <span className="num">
                {t("dashboard.in_amount", { amount: formatMoney(income, lang) })}
              </span>
            </span>
            <span className="flex items-center gap-1 font-semibold">
              <ArrowUpRight className="text-on-dark-muted size-3.5" aria-hidden />
              <span className="num">
                {t("dashboard.out_amount", { amount: formatMoney(expense, lang) })}
              </span>
            </span>
          </div>
          {spentPct !== null && (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-white/12" aria-hidden>
                <div
                  className="h-full origin-left rounded-full bg-[linear-gradient(90deg,#a8d878,#c3ea8c)] [animation:grow-x_1s_var(--ease-out-soft)_.2s_both]"
                  style={{ width: `${Math.max(spentPct, 2)}%` }}
                />
              </div>
              <p className="text-on-dark-muted mt-2 text-[12px]">
                {t("dashboard.spent_share", { pct: spentPct })}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <ScoreStat href="/score" label={t("score.title")} score={health.data?.[0]?.score} />
        {/* credit readiness is informational only, and the panel says so */}
        <ScoreStat
          href="/readiness"
          label={t("readiness.title")}
          note={t("readiness.info_only")}
          score={readiness.data?.[0]?.score}
        />
      </div>

      <nav
        aria-label={t("dashboard.quick_actions")}
        className="mt-6 grid grid-cols-4 gap-2 border-t border-white/10 pt-5 sm:max-w-md lg:mt-auto"
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
    </section>
  );
}

/** Entry point to the coach from home, so asking a question is one tap from the balance. */
function AskCoach() {
  const { t } = useTranslation();
  return (
    <Link
      href="/coach"
      className="surface-lime group rise relative flex items-center gap-3.5 overflow-hidden rounded-[1.75rem] p-4 pr-3.5 shadow-[0_14px_30px_-18px_rgba(79,158,58,.8)] tap-soft"
      style={{ "--i": 1 } as React.CSSProperties}
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[image:var(--gradient-teal)] text-lime shadow-[0_8px_18px_-10px_rgba(6,47,49,.8)]">
        <Sparkles className="ic-spark size-[22px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold">{t("dashboard.ask_coach")}</span>
        <span className="text-brand-ink/70 block truncate text-[13px]">
          “{t("coach.suggest_can_afford")}”
        </span>
      </span>
      <span className="bg-brand-ink text-lime grid size-11 shrink-0 place-items-center rounded-full">
        <ArrowRight className="ic-forward size-5" aria-hidden />
      </span>
    </Link>
  );
}

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

export function Dashboard() {
  const { t, i18n } = useTranslation();
  const { userId } = useAuth();
  const profile = useProfile(userId);
  const [period, setPeriod] = useState<Period>("month");
  const { summary, month, byCategory, trend, balance } = useDashboard(period);
  const recent = useTransactionList(8);
  const lang = i18n.language;
  const { greeting, date } = useGreeting();

  useTransactionsRealtime();
  useAutoNudges(recent.isSuccess && recent.data.length > 0);

  const noTransactions = recent.isSuccess && recent.data.length === 0;
  const hasSimulated = recent.data?.some((r) => r.is_simulated) ?? false;
  const firstName = profile.data?.full_name?.trim().split(/\s+/)[0];

  return (
    <>
      <PageHeader
        eyebrow={date}
        lead={firstName ? `${greeting},` : undefined}
        title={firstName ?? greeting}
        subtitle={noTransactions ? undefined : t("home.subtitle")}
      />

      {recent.isPending && <LoadingCards hero rows={3} />}
      {recent.isError && <ErrorState onRetry={() => void recent.refetch()} />}

      {noTransactions && (
        <div className="space-y-4 pb-4">
          <EmptyState
            icon={Wallet}
            title={t("home.empty_title")}
            body={t("home.empty_body")}
            action={
              <Link
                href="/transactions/new"
                className={buttonVariants({ size: "lg" })}
                transitionTypes={NAV_FORWARD}
              >
                <Plus aria-hidden />
                {t("transactions.add")}
              </Link>
            }
          />
          <p className="text-muted-foreground px-1 text-center text-sm">{t("start.voice_hint")}</p>
          <div className="flex justify-center">
            <VoiceTryButton />
          </div>
          <GetStarted hasTransactions={false} />
        </div>
      )}

      {recent.isSuccess && !noTransactions && (
        <div className="space-y-7 pb-4 sm:space-y-9">
          <div className="space-y-3.5">
            <GetStarted hasTransactions />
            {/* the balance panel is the at-a-glance view: money, scores and shortcuts */}
            <BalancePanel
              balance={balance.data}
              income={month.data?.income}
              expense={month.data?.expense}
              simulated={hasSimulated}
            />
            <div className="grid gap-3.5 lg:grid-cols-2">
              <AskCoach />
              <InstallPrompt />
            </div>
            {hasSimulated && (
              <p className="text-muted-foreground px-1 text-xs">{t("common.simulated_note")}</p>
            )}
          </div>

          <section
            aria-labelledby="period-heading"
            className="rise"
            style={{ "--i": 3 } as React.CSSProperties}
          >
            <SectionHeader
              id="period-heading"
              title={t("dashboard.overview")}
              className="items-center"
            />
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

          <section aria-labelledby="recent-heading">
            <SectionHeader
              id="recent-heading"
              title={t("transactions.recent")}
              href="/transactions"
              linkLabel={t("transactions.see_all")}
            />
            <div className="finance-card p-2.5 sm:p-3">
              <TransactionList rows={recent.data} framed={false} />
            </div>
          </section>
        </div>
      )}
    </>
  );
}
