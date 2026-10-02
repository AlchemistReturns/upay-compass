"use client";

import { useTranslation } from "react-i18next";
import { PERIODS, type Period } from "@compass/shared";
import { cn } from "@/lib/utils";

export function PeriodTabs({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const { t } = useTranslation();
  return (
    <div role="tablist" aria-label={t("dashboard.period")} className="bg-muted flex rounded-lg p-1">
      {PERIODS.map((p) => (
        <button
          key={p}
          role="tab"
          type="button"
          aria-selected={value === p}
          onClick={() => onChange(p)}
          className={cn(
            "min-h-11 flex-1 rounded-md px-3 text-sm",
            value === p ? "bg-background font-medium shadow-sm" : "text-muted-foreground",
          )}
        >
          {t(`dashboard.period_${p}`)}
        </button>
      ))}
    </div>
  );
}
