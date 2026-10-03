"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Pill, Ring } from "@/components/compass";
import { useRealtimeInvalidate } from "@/features/realtime/use-realtime-invalidate";
import { useHealthSnapshots } from "./use-health";
import { NAV_FORWARD } from "@/components/page-transition";

export const BAND_COLOR = {
  low: "var(--status-critical)",
  fair: "var(--status-warning)",
  good: "var(--status-good)",
} as const;

const BAND_TONE = { low: "critical", fair: "warn", good: "good" } as const;

/** Compact score card for the dashboard; the score screen computes a fresh one when opened. */
export function HealthCard() {
  const { t } = useTranslation();
  const snapshots = useHealthSnapshots();
  useRealtimeInvalidate("health_scores", [["health"]]);
  const latest = snapshots.data?.[0];
  const score = latest?.score;
  const band = score === undefined ? null : score < 40 ? "low" : score < 70 ? "fair" : "good";

  return (
    <Link
      href="/score"
      transitionTypes={NAV_FORWARD}
      className="finance-card flex min-h-[5.5rem] items-center gap-4 p-4"
    >
      {/* the arc is decorative; the number and band are written out */}
      <Ring
        value={score ?? 0}
        size={56}
        stroke={6}
        color={band ? BAND_COLOR[band] : "var(--muted)"}
      >
        <span className="num text-lg font-extrabold">{score ?? "–"}</span>
      </Ring>
      <div className="min-w-0 flex-1">
        <div className="text-muted-foreground text-[12.5px] font-semibold">{t("score.title")}</div>
        {score === undefined || !band ? (
          <div className="mt-0.5 text-sm leading-snug font-semibold">{t("score.see_yours")}</div>
        ) : (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Pill tone={BAND_TONE[band]} className="h-7 px-3 text-[13px]">
              {t(`score.band_${band}`)}
            </Pill>
          </div>
        )}
      </div>
      <ChevronRight className="text-muted-foreground/60 size-5 shrink-0" aria-hidden />
    </Link>
  );
}
