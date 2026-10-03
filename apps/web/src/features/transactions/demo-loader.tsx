"use client";

import { useTranslation } from "react-i18next";
import { useOnline } from "@/features/pwa/use-online";
import { Bike, Briefcase, GraduationCap, Sparkles } from "lucide-react";
import { INCOME_TYPES, type IncomeType } from "@compass/shared";
import { cn } from "@/lib/utils";
import { useIngestDemoData } from "./use-transactions";

const PERSONA_ICON = { student: GraduationCap, gig: Bike, salaried: Briefcase } as const;

/** Empty state: one tap loads 90 days of simulated upay history for the chosen persona. */
export function DemoLoader({ suggested }: { suggested: IncomeType | null }) {
  const { t } = useTranslation();
  const online = useOnline();
  const ingest = useIngestDemoData();

  return (
    <section className="finance-card overflow-hidden">
      <div className="balance-panel rounded-none p-5 shadow-none sm:p-7">
        <div className="relative z-[1] max-w-lg">
          <span className="mb-4 grid size-11 place-items-center rounded-2xl bg-white/12 ring-1 ring-white/20">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <h2 className="text-xl font-semibold">{t("demo.title")}</h2>
          <p className="mt-1.5 text-sm leading-6 text-white/80">{t("demo.body")}</p>
        </div>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
        {INCOME_TYPES.map((p) => {
          const Icon = PERSONA_ICON[p];
          const isSuggested = p === suggested;
          return (
            <button
              key={p}
              type="button"
              disabled={ingest.isPending || !online}
              onClick={() => ingest.mutate(p)}
              className={cn(
                "finance-card flex min-h-16 items-center gap-3 p-4 text-left disabled:opacity-50 sm:flex-col sm:items-start",
                isSuggested && "border-primary ring-secondary ring-4",
              )}
            >
              <span className={cn("icon-chip", isSuggested && "bg-primary text-white")}>
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{t(`onboarding.${p}`)}</span>
                {isSuggested && (
                  <span className="text-primary block text-xs font-medium">
                    {t("demo.suggested")}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        {ingest.isPending && (
          <p role="status" className="text-muted-foreground mt-3 text-sm">
            {t("demo.loading")}
          </p>
        )}
        {ingest.isError && (
          <p role="alert" className="text-destructive mt-3 text-sm">
            {t("common.error")}
          </p>
        )}
        <p className="text-muted-foreground mt-3 text-xs">{t("common.simulated_note")}</p>
      </div>
    </section>
  );
}
