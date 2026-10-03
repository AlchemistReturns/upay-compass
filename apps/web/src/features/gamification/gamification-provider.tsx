"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-provider";
import { GAMIFICATION_EVENTS, badgeIcon, type GamificationResult } from "./gamification";

const TOAST_MS = 6000;

/**
 * Counts the day's visit toward the streak when the signed-in app opens, re-checks badges when
 * asked, and shows a toast for each newly earned badge. Failures are silent: this is a bonus layer.
 */
export function GamificationProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<string[]>([]);

  const apply = useCallback(
    (result: GamificationResult) => {
      queryClient.setQueryData(["gamification", userId], {
        streak_days: result.streak_days,
        badges: result.badges,
      });
      if (result.new_badges.length > 0) setToast(result.new_badges);
    },
    [queryClient, userId],
  );

  const check = useCallback(async () => {
    const { data, error } = await supabase.rpc("touch_activity");
    if (!error && data) apply(data as GamificationResult);
  }, [apply]);

  useEffect(() => {
    if (!userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- counts today's visit on app open
    void check();
    const onResult = (e: Event) => apply((e as CustomEvent<GamificationResult>).detail);
    const onCheck = () => void check();
    window.addEventListener(GAMIFICATION_EVENTS.result, onResult);
    window.addEventListener(GAMIFICATION_EVENTS.check, onCheck);
    return () => {
      window.removeEventListener(GAMIFICATION_EVENTS.result, onResult);
      window.removeEventListener(GAMIFICATION_EVENTS.check, onCheck);
    };
  }, [userId, check, apply]);

  useEffect(() => {
    if (toast.length === 0) return;
    const timer = setTimeout(() => setToast([]), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <>
      {children}
      {toast.length > 0 && (
        <div
          role="status"
          className="pop text-on-dark fixed inset-x-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[60] mx-auto flex max-w-md items-center gap-3 rounded-[1.5rem] bg-[image:var(--gradient-teal)] p-3 pl-3.5 shadow-[var(--shadow-float)] ring-1 ring-white/10"
        >
          <div className="flex-1 space-y-1">
            {toast.map((id) => {
              const Icon = badgeIcon(id);
              return (
                <div key={id} className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(145deg,#ffd27a,#f0a531)] text-white">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div>
                    <div className="text-sm font-bold">{t("gamification.earned")}</div>
                    <div className="text-on-dark-muted text-xs">
                      {t(`gamification.badges.${id}.title`)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            aria-label={t("common.close")}
            className="text-on-dark-muted grid size-10 shrink-0 place-items-center rounded-full hover:bg-white/10"
            onClick={() => setToast([])}
          >
            <X className="ic-close size-4" aria-hidden />
          </button>
        </div>
      )}
    </>
  );
}
