"use client";

import { useTranslation } from "react-i18next";
import { PERIODS, type Period } from "@compass/shared";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

/** iOS-style segmented control: a raised thumb springs under the chosen period. */
export function PeriodTabs({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const { t } = useTranslation();
  const index = PERIODS.indexOf(value);
  return (
    <div
      role="tablist"
      aria-label={t("dashboard.period")}
      className="relative flex rounded-full bg-segment p-1 sm:max-w-md"
    >
      <span
        aria-hidden
        className="bg-thumb absolute top-1 bottom-1 left-1 rounded-full shadow-[var(--shadow-thumb)] transition-transform duration-500 ease-[var(--ease-spring)]"
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
            "tap relative min-h-11 flex-1 rounded-full px-3 text-[13px] font-semibold",
            value === p ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t(`dashboard.period_${p}`)}
        </button>
      ))}
    </div>
  );
}
