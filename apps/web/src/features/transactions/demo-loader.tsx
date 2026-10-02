"use client";

import { useTranslation } from "react-i18next";
import { useOnline } from "@/features/pwa/use-online";
import { INCOME_TYPES, type IncomeType } from "@compass/shared";
import { Button } from "@/components/ui/button";
import { useIngestDemoData } from "./use-transactions";

/** Empty state: one tap loads 90 days of simulated upay history for the chosen persona. */
export function DemoLoader({ suggested }: { suggested: IncomeType | null }) {
  const { t } = useTranslation();
  const online = useOnline();
  const ingest = useIngestDemoData();

  return (
    <section className="rounded-xl border p-4">
      <h2 className="font-medium">{t("demo.title")}</h2>
      <p className="text-muted-foreground mt-1 mb-4 text-sm">{t("demo.body")}</p>
      <div className="space-y-2">
        {INCOME_TYPES.map((p) => (
          <Button
            key={p}
            variant={p === suggested ? "default" : "outline"}
            className="h-12 w-full justify-start"
            disabled={ingest.isPending || !online}
            onClick={() => ingest.mutate(p)}
          >
            {t(`onboarding.${p}`)}
            {p === suggested && (
              <span className="ml-2 text-xs opacity-80">{t("demo.suggested")}</span>
            )}
          </Button>
        ))}
      </div>
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
    </section>
  );
}
