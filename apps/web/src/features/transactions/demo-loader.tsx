"use client";

import { useTranslation } from "react-i18next";
import { useOnline } from "@/features/pwa/use-online";
import { Bike, Briefcase, ChevronRight, GraduationCap, Loader2, Sparkles } from "lucide-react";
import { INCOME_TYPES, type IncomeType } from "@compass/shared";
import { Pill } from "@/components/compass";
import { cn } from "@/lib/utils";
import { useIngestDemoData } from "./use-transactions";

export const PERSONA_ICON = { student: GraduationCap, gig: Bike, salaried: Briefcase } as const;

/** Empty state: one tap loads simulated upay history for the chosen persona. */
export function DemoLoader({ suggested }: { suggested: IncomeType | null }) {
  const { t } = useTranslation();
  const online = useOnline();
  const ingest = useIngestDemoData();

  return (
    <section className="rise space-y-3">
      <div className="balance-panel p-6 sm:p-8">
        <span className="bg-lime text-brand-ink mb-5 grid size-14 place-items-center rounded-[1.25rem] shadow-[0_10px_24px_-10px_rgba(195,234,140,.8)]">
          <Sparkles className="size-6" aria-hidden />
        </span>
        <h2 className="max-w-md text-2xl leading-tight font-extrabold tracking-tight">
          {t("demo.title")}
        </h2>
        <p className="text-on-dark-muted mt-2 max-w-md text-sm leading-6">{t("demo.body")}</p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-3">
        {INCOME_TYPES.map((p, i) => {
          const Icon = PERSONA_ICON[p];
          const isSuggested = p === suggested;
          const loading = ingest.isPending && ingest.variables === p;
          return (
            <button
              key={p}
              type="button"
              disabled={ingest.isPending || !online}
              onClick={() => ingest.mutate(p)}
              style={{ "--i": i + 1 } as React.CSSProperties}
              className={cn(
                "finance-card rise flex min-h-[4.5rem] items-center gap-3.5 p-4 text-left disabled:opacity-55 sm:flex-col sm:items-start",
                isSuggested && "ring-lime border-leaf/50 ring-4",
              )}
            >
              <span
                className={cn(
                  "icon-chip size-12 rounded-2xl",
                  isSuggested && "bg-brand-deep text-lime",
                )}
              >
                {loading ? (
                  <Loader2 className="size-5 animate-spin" aria-hidden />
                ) : (
                  <Icon className="size-5" aria-hidden />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold">{t(`onboarding.${p}`)}</span>
                {isSuggested && (
                  <Pill tone="lime" className="mt-1">
                    {t("demo.suggested").replace(/[()]/g, "")}
                  </Pill>
                )}
              </span>
              <ChevronRight
                className="text-muted-foreground/60 size-5 shrink-0 sm:hidden"
                aria-hidden
              />
            </button>
          );
        })}
      </div>

      {ingest.isPending && (
        <p role="status" className="callout">
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden />
          {t("demo.loading")}
        </p>
      )}
      {ingest.isError && (
        <p role="alert" className="text-destructive text-sm">
          {t("common.error")}
        </p>
      )}
    </section>
  );
}
