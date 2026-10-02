"use client";

import Link from "next/link";
import { Flame } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGamification } from "./use-gamification";

/** Small streak chip for the dashboard; links to the badge shelf on the learn page. */
export function StreakChip() {
  const { t } = useTranslation();
  const state = useGamification();
  const days = state.data?.streak_days ?? 0;
  if (days < 1) return null;
  return (
    <Link
      href="/learn"
      className="bg-muted inline-flex min-h-11 items-center gap-1.5 self-start rounded-full px-4 text-sm"
    >
      <Flame className="text-primary size-4" aria-hidden />
      {t("gamification.streak", { count: days })}
    </Link>
  );
}
