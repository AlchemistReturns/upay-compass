"use client";

import { useTranslation } from "react-i18next";
import { PERIODS, type Period } from "@compass/shared";
import { cn } from "@/lib/utils";

export function PeriodTabs({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="tablist"
      aria-label={t("dashboard.period")}
      className="glass flex rounded-2xl p-1 shadow-none sm:max-w-md"
    >
      {PERIODS.map((p) => (
        <button
          key={p}
          role="tab"
          type="button"
          aria-selected={value === p}
          onClick={() => onChange(p)}
          className={cn(
            "min-h-11 flex-1 rounded-xl px-3 text-sm transition-all",
            value === p
              ? "bg-card text-foreground font-semibold shadow-[0_1px_3px_rgba(15,31,51,.12)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t(`dashboard.period_${p}`)}
        </button>
      ))}
    </div>
  );
}
