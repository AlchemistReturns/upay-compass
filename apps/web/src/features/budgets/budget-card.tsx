"use client";

import { AlertTriangle, CheckCircle2, OctagonAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { budgetStatus, type BudgetStatus } from "@compass/shared";
import { formatMoney } from "@/lib/format";
import { useCategories } from "@/features/categories/use-categories";
import type { BudgetProgress } from "./use-budgets";

const STATUS_STYLE: Record<BudgetStatus, { color: string; Icon: typeof CheckCircle2 }> = {
  ok: { color: "var(--chart-bar)", Icon: CheckCircle2 },
  warning: { color: "var(--status-warning)", Icon: AlertTriangle },
  over: { color: "var(--status-critical)", Icon: OctagonAlert },
};

/** Progress bar: blue while fine, amber from the alert threshold, red past the limit. Status is always also written out. */
export function BudgetCard({ budget, onClick }: { budget: BudgetProgress; onClick: () => void }) {
  const { t, i18n } = useTranslation();
  const { data: categories } = useCategories();
  const lang = i18n.language;
  const cat = categories?.find((c) => c.id === budget.category_id);
  const name = cat ? (lang === "bn" ? cat.name_bn : cat.name_en) : "-";

  const status = budgetStatus(budget.spent, budget.limit_amount, budget.alert_threshold);
  const { color, Icon } = STATUS_STYLE[status];
  const pct = Math.min((budget.spent / budget.limit_amount) * 100, 100);
  const diff = Math.abs(budget.limit_amount - budget.spent);

  return (
    <button
      type="button"
      onClick={onClick}
      className="finance-card w-full p-4 text-left"
      aria-label={`${name}: ${t(`budgets.status_${status}`)}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{name}</span>
        <span className="text-sm tabular-nums">
          {formatMoney(budget.spent, lang)}
          <span className="text-muted-foreground">
            {" / "}
            {formatMoney(budget.limit_amount, lang)}
          </span>
        </span>
      </div>

      <div
        className="bg-muted relative mt-2 h-2.5 rounded-r-full rounded-l-sm"
        role="progressbar"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div
          className="h-full rounded-r-full rounded-l-sm"
          style={{ width: `${Math.max(pct, 1.5)}%`, background: color }}
        />
        {/* tick where the alert fires */}
        <span
          aria-hidden
          className="absolute top-[-3px] h-[16px] w-px bg-neutral-500/60"
          style={{ left: `${budget.alert_threshold * 100}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5">
          <Icon className="size-3.5" style={{ color }} aria-hidden />
          {t(`budgets.status_${status}`)}
        </span>
        <span className="text-muted-foreground tabular-nums">
          {status === "over"
            ? t("budgets.over_by", { amount: formatMoney(diff, lang) })
            : t("budgets.left", { amount: formatMoney(diff, lang) })}
        </span>
      </div>
    </button>
  );
}
