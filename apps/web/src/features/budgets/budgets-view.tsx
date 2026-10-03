"use client";

import { useState } from "react";
import { PiggyBank, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader, TOOLBAR_BUTTON } from "@/components/page-header";
import { AnimatedNumber, EmptyState, ErrorState, LoadingCards, Ring } from "@/components/compass";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { useRealtimeInvalidate } from "@/features/realtime/use-realtime-invalidate";
import { BudgetCard } from "./budget-card";
import { BudgetForm } from "./budget-form";
import { useBudgetProgress, type BudgetProgress } from "./use-budgets";

function BudgetSummary({ rows }: { rows: BudgetProgress[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const spent = rows.reduce((n, b) => n + b.spent, 0);
  const limit = rows.reduce((n, b) => n + b.limit_amount, 0);
  const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
  const over = spent > limit;

  return (
    <section className="balance-panel rise flex items-center gap-5 p-5 sm:gap-7 sm:p-7">
      <Ring
        value={pct}
        size={112}
        stroke={11}
        track="rgba(255,255,255,.1)"
        color={over ? "#ff9b7d" : "var(--lime)"}
      >
        <div>
          <div className="num text-[1.625rem] leading-none font-extrabold">{pct}%</div>
        </div>
      </Ring>
      <div className="min-w-0 flex-1">
        <div className="text-on-dark-muted text-[13px] font-semibold">
          {t("dashboard.this_month")}
        </div>
        <div className="mt-1 text-[1.75rem] leading-none font-extrabold tracking-tight sm:text-[2rem]">
          <AnimatedNumber value={spent} format={(n) => formatMoney(n, lang)} />
        </div>
        <div className="text-on-dark-muted num mt-1.5 text-[13px]">
          {t("budgets.spent_of", { amount: formatMoney(limit, lang) })}
        </div>
        <p className="mt-3 text-[13px] leading-5 font-medium">
          {over
            ? t("budgets.over_total", { amount: formatMoney(spent - limit, lang) })
            : t("budgets.left_total", { amount: formatMoney(limit - spent, lang) })}
        </p>
      </div>
    </section>
  );
}

export function BudgetsView() {
  const { t } = useTranslation();
  const budgets = useBudgetProgress();
  // the sheet keeps showing its form while it animates closed, so `target` outlives `open`
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string | "new">("new");
  const [opens, setOpens] = useState(0);

  // Budget progress moves with budgets and with spending.
  useRealtimeInvalidate("budgets", [["budgets"]]);
  useRealtimeInvalidate("transactions", [["budgets"]]);

  const rows = budgets.data ?? [];
  const current = rows.find((b) => b.budget_id === target);

  function edit(id: string | "new") {
    setTarget(id);
    setOpens((n) => n + 1);
    setOpen(true);
  }

  return (
    <>
      <PageHeader
        title={t("budgets.title")}
        subtitle={rows.length > 0 ? t("budgets.count", { count: rows.length }) : undefined}
        actions={
          budgets.isSuccess && (
            <button
              type="button"
              className={TOOLBAR_BUTTON}
              aria-label={t("budgets.add")}
              title={t("budgets.add")}
              onClick={() => edit("new")}
            >
              <Plus className="ic-add size-5" aria-hidden />
            </button>
          )
        }
      />

      {budgets.isPending && <LoadingCards hero rows={3} />}
      {budgets.isError && <ErrorState onRetry={() => void budgets.refetch()} />}

      {budgets.isSuccess && (
        <div className="space-y-5 pb-4">
          {rows.length === 0 ? (
            <EmptyState
              icon={PiggyBank}
              title={t("budgets.add")}
              body={t("budgets.empty")}
              action={
                <Button onClick={() => edit("new")}>
                  <Plus aria-hidden />
                  {t("budgets.add")}
                </Button>
              }
            />
          ) : (
            <>
              <BudgetSummary rows={rows} />
              <div className="grid gap-3 md:grid-cols-2">
                {rows.map((b, i) => (
                  <BudgetCard
                    key={b.budget_id}
                    budget={b}
                    index={i}
                    onClick={() => edit(b.budget_id)}
                  />
                ))}
              </div>
              <p className="text-muted-foreground px-1 text-xs leading-5">{t("budgets.intro")}</p>
            </>
          )}
        </div>
      )}

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={target === "new" ? t("budgets.add") : t("budgets.edit")}
      >
        <BudgetForm
          key={`${target}-${opens}`}
          existing={current}
          takenCategoryIds={rows.map((b) => b.category_id)}
          onDone={() => setOpen(false)}
        />
      </Sheet>
    </>
  );
}
