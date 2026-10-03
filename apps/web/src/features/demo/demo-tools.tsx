"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { INCOME_TYPES, type IncomeType } from "@compass/shared";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { requestBadgeCheck } from "@/features/gamification/gamification";
import { useProfile } from "@/features/profile/use-profile";
import { useOnline } from "@/features/pwa/use-online";
import { supabase } from "@/lib/supabase";

function useResetDemo() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (persona: IncomeType) => {
      const { error } = await supabase.functions.invoke("reset-demo", { body: { persona } });
      if (error) throw error;
    },
    onSuccess: async () => {
      try {
        // let the alert rules run again for the fresh data
        sessionStorage.removeItem(`compass.nudges.${userId}`);
      } catch {
        // ignore
      }
      await queryClient.invalidateQueries();
      requestBadgeCheck();
    },
  });
}

/** Start the demo over from a clean account: wipe this user's data and load a persona again. */
export function DemoTools() {
  const { t } = useTranslation();
  const { userId } = useAuth();
  const online = useOnline();
  const profile = useProfile(userId);
  const reset = useResetDemo();

  return (
    <section
      className="space-y-3 rounded-2xl border border-dashed border-input bg-card/60 p-4 sm:p-5"
      aria-label={t("demo.tools_title")}
    >
      <div>
        <h2 className="section-title">{t("demo.tools_title")}</h2>
        <p className="text-muted-foreground text-xs">{t("demo.tools_hint")}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {INCOME_TYPES.map((p) => (
          <Button
            key={p}
            variant="outline"
            className="min-h-11 text-xs"
            disabled={reset.isPending || !online}
            onClick={() => window.confirm(t("demo.reset_confirm")) && reset.mutate(p)}
          >
            <RotateCcw className="size-3.5" aria-hidden />
            {t(`onboarding.${p}`)}
          </Button>
        ))}
      </div>
      {reset.isPending && (
        <p role="status" className="text-muted-foreground text-sm">
          {t("demo.resetting")}
        </p>
      )}
      {reset.isSuccess && (
        <p role="status" className="text-muted-foreground text-sm">
          {t("demo.reset_done")}
        </p>
      )}
      {reset.isError && (
        <p role="alert" className="text-destructive text-sm">
          {t("common.error")}
        </p>
      )}
      {profile.data?.role === "admin" && (
        <Link
          href="/admin"
          className="text-primary inline-flex min-h-11 items-center gap-1.5 text-sm"
        >
          <ShieldCheck className="size-4" aria-hidden />
          {t("admin.open")}
        </Link>
      )}
    </section>
  );
}
