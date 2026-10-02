"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useRealtimeInvalidate } from "@/features/realtime/use-realtime-invalidate";
import { BudgetCard } from "./budget-card";
import { BudgetForm } from "./budget-form";
import { useBudgetProgress } from "./use-budgets";

export function BudgetsView() {
  const { t } = useTranslation();
  const budgets = useBudgetProgress();
  // "new" opens the create form; a budget id opens that budget for editing.
  const [editing, setEditing] = useState<string | "new" | null>(null);

  // Budget progress moves with budgets and with spending.
  useRealtimeInvalidate("budgets", [["budgets"]]);
  useRealtimeInvalidate("transactions", [["budgets"]]);

  const rows = budgets.data ?? [];
  const current = rows.find((b) => b.budget_id === editing);

  return (
    <>
      <PageHeader title={t("budgets.title")} />
      <p className="text-muted-foreground mb-4 text-sm">{t("budgets.intro")}</p>

      {budgets.isPending && <p className="text-muted-foreground">{t("common.loading")}</p>}
      {budgets.isError && (
        <div>
          <p className="mb-2">{t("common.error")}</p>
          <Button onClick={() => void budgets.refetch()}>{t("common.retry")}</Button>
        </div>
      )}

      {budgets.isSuccess && (
        <div className="space-y-3 pb-4">
          {editing !== null && (
            <BudgetForm
              key={editing}
              existing={current}
              takenCategoryIds={rows.map((b) => b.category_id)}
              onDone={() => setEditing(null)}
            />
          )}

          {editing === null && (
            <Button className="h-11 w-full" onClick={() => setEditing("new")}>
              <Plus className="mr-1 size-4" aria-hidden />
              {t("budgets.add")}
            </Button>
          )}

          {rows.length === 0 && editing === null && (
            <p className="text-muted-foreground text-sm">{t("budgets.empty")}</p>
          )}

          {rows.map((b) => (
            <BudgetCard key={b.budget_id} budget={b} onClick={() => setEditing(b.budget_id)} />
          ))}
        </div>
      )}
    </>
  );
}
