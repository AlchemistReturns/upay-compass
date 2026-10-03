"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Pill, Ring } from "@/components/compass";
import { NAV_FORWARD } from "@/components/page-transition";
import { BAND_COLOR } from "@/features/health/health-card";
import { useRealtimeInvalidate } from "@/features/realtime/use-realtime-invalidate";
import { useReadinessSnapshots } from "./use-readiness";

const BAND_TONE = { low: "critical", fair: "warn", good: "good" } as const;

/** Compact card for the dashboard. Informational only: it says so on the card too. */
export function ReadinessCard() {
  const { t } = useTranslation();
  const snapshots = useReadinessSnapshots();
  useRealtimeInvalidate("readiness_scores", [["readiness"]]);
  const score = snapshots.data?.[0]?.score;
  const band = score === undefined ? null : score < 40 ? "low" : score < 70 ? "fair" : "good";

  return (
    <Link
      href="/readiness"
      transitionTypes={NAV_FORWARD}
      className="finance-card flex min-h-[5.5rem] items-center gap-4 p-4"
    >
      <Ring
        value={score ?? 0}
        size={56}
        stroke={6}
        color={band ? BAND_COLOR[band] : "var(--muted)"}
      >
        <span className="num text-lg font-extrabold">{score ?? "–"}</span>
      </Ring>
      <div className="min-w-0 flex-1">
        <div className="text-muted-foreground text-[12.5px] font-semibold">
          {t("readiness.title")}
        </div>
        {band ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Pill tone={BAND_TONE[band]} className="h-7 px-3 text-[13px]">
              {t(`score.band_${band}`)}
            </Pill>
            <span className="text-muted-foreground text-[12px]">{t("readiness.info_only")}</span>
          </div>
        ) : (
          <div className="mt-0.5 text-sm leading-snug font-semibold">
            {t("readiness.see_yours")}
          </div>
        )}
      </div>
      <ChevronRight className="ic-forward text-muted-foreground/60 size-5 shrink-0" aria-hidden />
    </Link>
  );
}
