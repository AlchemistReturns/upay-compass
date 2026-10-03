"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRealtimeInvalidate } from "@/features/realtime/use-realtime-invalidate";
import { useHealthSnapshots } from "./use-health";

const BAND_COLOR = {
  low: "var(--status-critical)",
  fair: "var(--status-warning)",
  good: "var(--status-good)",
} as const;

/** Compact score card for the dashboard; the score screen computes a fresh one when opened. */
export function HealthCard() {
  const { t } = useTranslation();
  const snapshots = useHealthSnapshots();
  useRealtimeInvalidate("health_scores", [["health"]]);
  const latest = snapshots.data?.[0];
  const score = latest?.score;
  const band = score === undefined ? null : score < 40 ? "low" : score < 70 ? "fair" : "good";

  return (
    <Link href="/score" className="finance-card flex min-h-20 items-center gap-3 p-4">
      {/* small ring: the arc is decorative, the number and band are written out next to it */}
      <svg viewBox="0 0 36 36" className="size-11 shrink-0 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--muted)" strokeWidth="4" />
        {score !== undefined && band && (
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            stroke={BAND_COLOR[band]}
            strokeWidth="4"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${Math.max(score, 2)} 100`}
          />
        )}
      </svg>
      <div className="min-w-0 flex-1">
        <div className="text-muted-foreground text-xs font-medium">{t("score.title")}</div>
        {score === undefined ? (
          <div className="text-sm font-medium">{t("score.see_yours")}</div>
        ) : (
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl leading-tight font-semibold tabular-nums">{score}</span>
            <span className="text-muted-foreground text-sm">/ 100 · {t(`score.band_${band}`)}</span>
          </div>
        )}
      </div>
      <ChevronRight className="text-muted-foreground size-5 shrink-0" aria-hidden />
    </Link>
  );
}
