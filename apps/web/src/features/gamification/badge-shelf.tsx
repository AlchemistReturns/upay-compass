"use client";

import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SectionHeader } from "@/components/compass";
import { cn } from "@/lib/utils";
import { BADGES, badgeIcon } from "./gamification";
import { useGamification } from "./use-gamification";

/** Every badge, earned ones in gold; locked ones say how to earn them. */
export function BadgeShelf() {
  const { t } = useTranslation();
  const state = useGamification();
  const earned = new Set((state.data?.badges ?? []).map((b) => b.id));

  return (
    <section aria-labelledby="badge-shelf">
      <SectionHeader id="badge-shelf" title={t("gamification.shelf")} />
      <ul className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {BADGES.map(({ id }) => {
          const Icon = badgeIcon(id);
          const has = earned.has(id);
          return (
            <li
              key={id}
              className={cn(
                "flex flex-col gap-3 rounded-3xl p-4",
                has
                  ? "border border-[#f6dca3] bg-[linear-gradient(160deg,#fffaf0,#fff0d2)] shadow-[0_12px_26px_-18px_rgba(240,165,49,.9)]"
                  : "border border-dashed border-[rgba(13,75,76,.16)] bg-white/45",
              )}
            >
              <span
                className={cn(
                  "grid size-12 place-items-center rounded-2xl",
                  has
                    ? "bg-[linear-gradient(145deg,#ffd27a,#f0a531)] text-white shadow-[0_8px_18px_-8px_rgba(240,165,49,.9)]"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {has ? (
                  <Icon className="size-5" aria-hidden />
                ) : (
                  <Lock className="size-[18px]" aria-hidden />
                )}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-bold">{t(`gamification.badges.${id}.title`)}</div>
                <div
                  className={cn(
                    "mt-0.5 text-xs leading-4",
                    has ? "text-reward-ink font-semibold" : "text-muted-foreground",
                  )}
                >
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
