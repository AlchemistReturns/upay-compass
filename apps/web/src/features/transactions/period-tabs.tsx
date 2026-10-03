"use client";

import { useTranslation } from "react-i18next";
import { PERIODS, type Period } from "@compass/shared";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

/** iOS-style segmented control: a white thumb slides under the chosen period. */
export function PeriodTabs({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const { t } = useTranslation();
  const index = PERIODS.indexOf(value);
  return (
    <div
      role="tablist"
      aria-label={t("dashboard.period")}
      className="relative flex rounded-full bg-[#e3ece4] p-1 sm:max-w-md"
    >
      <span
        aria-hidden
        className="bg-card absolute top-1 bottom-1 left-1 rounded-full shadow-[0_1px_2px_rgba(6,47,49,.1),0_4px_12px_-4px_rgba(6,47,49,.18)] transition-transform duration-400 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{
          width: `calc((100% - 0.5rem) / ${PERIODS.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {PERIODS.map((p) => (
        <button
          key={p}
          role="tab"
          type="button"
          aria-selected={value === p}
          onClick={() => {
            if (p !== value) haptic("light");
            onChange(p);
          }}
          className={cn(
            "relative min-h-11 flex-1 rounded-full px-3 text-[13px] font-semibold transition-colors duration-200",
            value === p ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t(`dashboard.period_${p}`)}
        </button>
      ))}
    </div>
  );
}
