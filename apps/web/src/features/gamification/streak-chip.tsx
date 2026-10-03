"use client";

import Link from "next/link";
import { ChevronRight, Flame } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGamification } from "./use-gamification";

/** Streak card for the dashboard; links to the badge shelf on the learn page. */
export function StreakChip() {
  const { t } = useTranslation();
  const state = useGamification();
  const days = state.data?.streak_days ?? 0;
  if (days < 1) return null;
  return (
    <Link href="/learn" className="finance-card flex min-h-[5.5rem] items-center gap-4 p-4">
      <span className="grid size-14 shrink-0 place-items-center rounded-[1.1rem] bg-[linear-gradient(145deg,#ffd27a,#f0a531)] text-white shadow-[0_10px_20px_-12px_rgba(240,165,49,.9)]">
        <Flame className="size-6" fill="currentColor" strokeWidth={1.5} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-muted-foreground text-[12.5px] font-semibold">{t("nav.learn")}</div>
        <div className="mt-0.5 text-[15px] font-bold">
          {t("gamification.streak", { count: days })}
        </div>
      </div>
      <ChevronRight className="text-muted-foreground/60 size-5 shrink-0" aria-hidden />
    </Link>
  );
}
