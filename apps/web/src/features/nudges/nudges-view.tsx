"use client";

import Link from "next/link";
import {
  BellOff,
  CalendarClock,
  CheckCheck,
  LineChart,
  OctagonAlert,
  PiggyBank,
  ScanSearch,
  Target,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader, TOOLBAR_BUTTON } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingCards } from "@/components/compass";
import { toast } from "@/components/toaster";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useNudgeText } from "./use-nudge-text";
import { useMarkNudgesRead, useNudges } from "./use-nudges";

const TYPE_STYLE: Record<string, { Icon: LucideIcon; tone: string }> = {
  budget_threshold: { Icon: PiggyBank, tone: "bg-warning-soft text-warning-ink" },
  budget_exceeded: { Icon: OctagonAlert, tone: "bg-negative-soft text-destructive" },
  overspend: { Icon: TrendingUp, tone: "bg-warning-soft text-warning-ink" },
  goal_behind: { Icon: Target, tone: "bg-secondary text-primary" },
  bill_due: {
    Icon: CalendarClock,
    tone: "bg-[#e3f0fb] text-[#1f5f95] dark:bg-[rgba(110,170,230,.15)] dark:text-[#9ccaf4]",
  },
  forecast_risk: { Icon: LineChart, tone: "bg-negative-soft text-destructive" },
  unusual_transaction: { Icon: ScanSearch, tone: "bg-warning-soft text-warning-ink" },
};
const FALLBACK = { Icon: BellOff, tone: "bg-muted text-muted-foreground" };

export function NudgesView() {
  const { t, i18n } = useTranslation();
  const nudges = useNudges();
  const markRead = useMarkNudgesRead();
  const text = useNudgeText();
  const unread = nudges.data?.filter((n) => !n.read).length ?? 0;

  return (
    <>
      <PageHeader
        title={t("nudges.title")}
        back="/"
        subtitle={unread > 0 ? t("nudges.bell_unread", { count: unread }) : undefined}
        actions={
          unread > 0 && (
            <button
              type="button"
              className={TOOLBAR_BUTTON}
              aria-label={t("nudges.mark_all")}
              title={t("nudges.mark_all")}
              disabled={markRead.isPending}
              onClick={() =>
                markRead.mutate("all", {
                  onSuccess: () => toast.success(t("nudges.toast_all_read")),
                })
              }
            >
              <CheckCheck className="ic-pop size-[18px]" aria-hidden />
            </button>
          )
        }
      />

      {nudges.isPending && <LoadingCards rows={4} />}
      {nudges.isError && <ErrorState onRetry={() => void nudges.refetch()} />}

      {nudges.isSuccess && (
        <div className="space-y-3 pb-4">
          {nudges.data.length === 0 ? (
            <EmptyState icon={BellOff} body={t("nudges.empty")} />
          ) : (
            <ul className="space-y-2.5">
              {nudges.data.map((n, i) => {
                const { title, body, href } = text(n);
                const { Icon, tone } = TYPE_STYLE[n.type] ?? FALLBACK;
                return (
                  <li
                    key={n.id}
                    className="rise"
                    style={{ "--i": Math.min(i, 8) } as React.CSSProperties}
                  >
                    <Link
                      href={href}
                      onClick={() => !n.read && markRead.mutate([n.id])}
                      className={cn(
                        "finance-card relative flex min-h-16 items-start gap-3.5 p-4",
                        !n.read &&
                          "border-leaf/40 shadow-[0_0_0_3px_rgba(255, 194, 14,.45),var(--shadow-card)]",
                      )}
                    >
                      <span
                        className={cn("grid size-11 shrink-0 place-items-center rounded-2xl", tone)}
                      >
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div
                          className={cn(
                            "text-[15px] leading-snug",
                            n.read ? "font-semibold" : "font-bold",
                          )}
                        >
                          {!n.read && <span className="sr-only">{t("nudges.unread")}: </span>}
                          {title}
                        </div>
                        {body && (
                          <div className="text-muted-foreground mt-0.5 text-[13px] leading-5">
                            {body}
                          </div>
                        )}
                        <div className="text-muted-foreground mt-1.5 text-xs font-medium">
                          {formatShortDate(n.created_at, i18n.language)}
                        </div>
                      </div>
                      {!n.read && (
                        <span
                          aria-hidden
                          // radiates once so a new alert is noticed, then sits still
                          className="bg-leaf glow-ping relative mt-1.5 size-2.5 shrink-0 rounded-full"
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
