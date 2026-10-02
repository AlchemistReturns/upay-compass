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
      <h2 id="badge-shelf" className="mb-2 font-medium">
        {t("gamification.shelf")}
      </h2>
      <ul className="grid grid-cols-2 gap-2">
        {BADGES.map(({ id }) => {
          const Icon = badgeIcon(id);
          const has = earned.has(id);
          return (
            <li key={id} className={cn("flex gap-2 rounded-xl border p-3", !has && "bg-muted/40")}>
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full",
                  has ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
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
