"use client";

import { CircleCheck, OctagonAlert, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { budgetStatus, type BudgetStatus } from "@compass/shared";
import { CategoryIcon, Pill, ProgressBar } from "@/components/compass";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCategories } from "@/features/categories/use-categories";
import type { BudgetProgress } from "./use-budgets";

const STATUS_STYLE: Record<
  BudgetStatus,
  { color: string; Icon: typeof CircleCheck; tone: "good" | "warn" | "critical" }
> = {
  ok: { color: "var(--leaf)", Icon: CircleCheck, tone: "good" },
  warning: { color: "var(--status-warning)", Icon: TriangleAlert, tone: "warn" },
  over: { color: "var(--status-critical)", Icon: OctagonAlert, tone: "critical" },
};

/** Green while fine, amber from the alert threshold, red past the limit. Status is always also written out. */
export function BudgetCard({
  budget,
  index = 0,
  onClick,
}: {
  budget: BudgetProgress;
  index?: number;
  onClick: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { data: categories } = useCategories();
  const lang = i18n.language;
  const cat = categories?.find((c) => c.id === budget.category_id);
  const name = cat ? (lang === "bn" ? cat.name_bn : cat.name_en) : "-";

  const status = budgetStatus(budget.spent, budget.limit_amount, budget.alert_threshold);
  const { color, Icon, tone } = STATUS_STYLE[status];
  const pct = (budget.spent / budget.limit_amount) * 100;
  const diff = Math.abs(budget.limit_amount - budget.spent);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ "--i": index + 1 } as React.CSSProperties}
      className={cn(
        "finance-card rise w-full p-4 text-left sm:p-5",
        status === "over" &&
          "border-destructive/20 bg-[linear-gradient(180deg,var(--card),color-mix(in_oklab,var(--card),var(--destructive)_6%))]",
      )}
      aria-label={`${name}: ${t(`budgets.status_${status}`)}`}
    >
      <div className="flex items-center gap-3">
        <CategoryIcon categoryKey={cat?.key} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold">{name}</div>
          <div className="text-muted-foreground num text-[12.5px]">
            {t("budgets.used", { pct: Math.round(pct) })}
          </div>
        </div>
        <Pill tone={tone}>
          <Icon aria-hidden />
          {t(`budgets.status_${status}`)}
        </Pill>
      </div>

      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="num text-[1.375rem] leading-none font-extrabold">
          {formatMoney(budget.spent, lang)}
        </span>
        <span className="text-muted-foreground num text-sm font-medium">
          / {formatMoney(budget.limit_amount, lang)}
        </span>
      </div>

      <ProgressBar
        className="mt-3"
        value={pct}
        color={color}
        tick={budget.alert_threshold * 100}
        label={name}
      />

      <div
        className={cn(
          "num mt-2.5 text-[12.5px] font-semibold",
          status === "over" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {status === "over"
          ? t("budgets.over_by", { amount: formatMoney(diff, lang) })
          : t("budgets.left", { amount: formatMoney(diff, lang) })}
      </div>
    </button>
  );
}
