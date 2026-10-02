"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRealtimeInvalidate } from "@/features/realtime/use-realtime-invalidate";
import { useHealthSnapshots } from "./use-health";

/** Compact score card for the dashboard; the score screen computes a fresh one when opened. */
export function HealthCard() {
  const { t } = useTranslation();
  const snapshots = useHealthSnapshots();
  useRealtimeInvalidate("health_scores", [["health"]]);
  const latest = snapshots.data?.[0];
  const score = latest?.score;
  const band = score === undefined ? null : score < 40 ? "low" : score < 70 ? "fair" : "good";

  return (
    <Link href="/score" className="flex min-h-16 items-center gap-3 rounded-xl border p-3">
      <div className="min-w-0 flex-1">
        <div className="text-muted-foreground text-xs">{t("score.title")}</div>
        {score === undefined ? (
          <div className="text-sm">{t("score.see_yours")}</div>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">{score}</span>
            <span className="text-muted-foreground text-sm">/ 100 · {t(`score.band_${band}`)}</span>
          </div>
        )}
      </div>
      <ChevronRight className="text-muted-foreground size-5" aria-hidden />
    </Link>
  );
}
