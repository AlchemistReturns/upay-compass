"use client";

import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { BADGES, badgeIcon } from "./gamification";
import { useGamification } from "./use-gamification";

/** Every badge, earned ones highlighted; locked ones say how to earn them. */
export function BadgeShelf() {
  const { t } = useTranslation();
  const state = useGamification();
  const earned = new Set((state.data?.badges ?? []).map((b) => b.id));

  return (
    <section aria-labelledby="badge-shelf">
      <h2 id="badge-shelf" className="section-title mb-3">
        {t("gamification.shelf")}
      </h2>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {BADGES.map(({ id }) => {
          const Icon = badgeIcon(id);
          const has = earned.has(id);
          return (
            <li
              key={id}
              className={cn(
                "flex gap-3 rounded-2xl border p-3.5",
                has
                  ? "border-reward/40 bg-reward-soft/60 shadow-[0_6px_18px_rgba(245,158,11,.12)]"
                  : "bg-muted/40 border-dashed",
              )}
            >
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-xl",
                  has
                    ? "bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-sm"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {has ? (
                  <Icon className="size-4" aria-hidden />
                ) : (
                  <Lock className="size-4" aria-hidden />
                )}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium">{t(`gamification.badges.${id}.title`)}</div>
                <div className="text-muted-foreground text-xs">
                  {has ? t("gamification.unlocked") : t(`gamification.badges.${id}.how`)}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
