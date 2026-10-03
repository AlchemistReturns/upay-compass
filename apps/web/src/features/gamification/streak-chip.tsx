"use client";

import Link from "next/link";
import { ChevronRight, Flame } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGamification } from "./use-gamification";

/** Small streak chip for the dashboard; links to the badge shelf on the learn page. */
export function StreakChip() {
  const { t } = useTranslation();
  const state = useGamification();
  const days = state.data?.streak_days ?? 0;
  if (days < 1) return null;
  return (
    <Link href="/learn" className="finance-card flex min-h-20 items-center gap-3 p-4">
      <span className="icon-chip bg-reward-soft text-reward">
        <Flame className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-muted-foreground text-xs font-medium">{t("nav.learn")}</div>
        <div className="text-sm font-semibold">{t("gamification.streak", { count: days })}</div>
      </div>
      <ChevronRight className="text-muted-foreground size-5 shrink-0" aria-hidden />
    </Link>
  );
}
