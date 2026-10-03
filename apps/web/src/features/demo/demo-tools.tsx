"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, FlaskConical, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { INCOME_TYPES, type IncomeType } from "@compass/shared";
import { useAuth } from "@/features/auth/auth-provider";
import { requestBadgeCheck } from "@/features/gamification/gamification";
import { useProfile } from "@/features/profile/use-profile";
import { useOnline } from "@/features/pwa/use-online";
import { PERSONA_ICON } from "@/features/transactions/demo-loader";
import { useConfirm } from "@/components/confirm";
import { toast } from "@/components/toaster";
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
  const confirm = useConfirm();

  async function startOver(persona: (typeof INCOME_TYPES)[number]) {
    const ok = await confirm({
      title: t("demo.tools_title"),
      description: t("demo.reset_confirm"),
      confirmLabel: t("demo.reset"),
    });
    if (!ok) return;
    reset.mutate(persona, {
      onSuccess: () => toast.success(t("demo.reset_done")),
      onError: () => toast.error(t("common.error")),
    });
  }

  return (
    <section
      className="space-y-3.5 rounded-[1.75rem] border border-dashed border-[rgba(13,75,76,.18)] bg-white/50 p-4 sm:p-5"
      aria-label={t("demo.tools_title")}
    >
      <div className="flex items-start gap-3">
        <span className="icon-chip size-10 rounded-xl">
          <FlaskConical className="size-[18px]" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold">{t("demo.tools_title")}</h2>
          <p className="text-muted-foreground text-[12.5px] leading-5">{t("demo.tools_hint")}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {INCOME_TYPES.map((p) => {
          const Icon = PERSONA_ICON[p];
          const busy = reset.isPending && reset.variables === p;
          return (
            <button
              key={p}
              type="button"
              disabled={reset.isPending || !online}
              onClick={() => void startOver(p)}
              className="bg-card hover:border-primary/30 flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl border border-[rgba(13,75,76,.1)] px-2 text-center text-[12px] leading-tight font-semibold transition-[border-color,transform] active:scale-95 disabled:opacity-50"
            >
              <span className="relative">
                <Icon className="text-primary size-5" aria-hidden />
                <span className="bg-card absolute -right-2 -bottom-1.5 grid size-4 place-items-center rounded-full">
                  {busy ? (
                    <Loader2 className="text-muted-foreground size-3 animate-spin" aria-hidden />
                  ) : (
                    <RotateCcw className="text-muted-foreground size-3" aria-hidden />
                  )}
                </span>
              </span>
              {t(`onboarding.${p}`)}
            </button>
          );
        })}
      </div>
      {reset.isPending && (
        <p role="status" className="text-muted-foreground text-sm">
          {t("demo.resetting")}
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
          className="bg-card hover:bg-secondary flex min-h-12 items-center gap-2.5 rounded-2xl border border-[rgba(13,75,76,.1)] px-3.5 text-sm font-semibold transition-colors"
        >
          <ShieldCheck className="text-primary size-[18px]" aria-hidden />
          <span className="flex-1">{t("admin.open")}</span>
          <ChevronRight className="text-muted-foreground size-4" aria-hidden />
        </Link>
      )}
    </section>
  );
}
