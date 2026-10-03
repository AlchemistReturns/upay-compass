"use client";

import { BarChart3, Table2 } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Small round button that flips a chart to its table (and back). */
export function ChartToggle({ asTable, onToggle }: { asTable: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const label = asTable ? t("dashboard.show_chart") : t("dashboard.show_table");
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className="bg-muted text-muted-foreground hover:text-foreground grid size-11 shrink-0 place-items-center rounded-full transition-colors active:scale-95"
    >
      {asTable ? (
        <BarChart3 className="size-[18px]" aria-hidden />
      ) : (
        <Table2 className="size-[18px]" aria-hidden />
      )}
    </button>
  );
}
