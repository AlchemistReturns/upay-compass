"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useCategories } from "@/features/categories/use-categories";
import { useDeleteBudget, useSaveBudget, type BudgetProgress } from "./use-budgets";

const schema = z.object({
  category_id: z.number().int().positive(),
  limit_amount: z.number().positive().max(100_000_000),
  alert_threshold: z.number().min(0.5).max(1),
});

/** Create a budget (no `existing`) or change/remove one. The category of an existing budget is fixed. */
export function BudgetForm({
  existing,
  takenCategoryIds,
  onDone,
}: {
  existing?: BudgetProgress;
  takenCategoryIds: number[];
  onDone: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { data: categories } = useCategories();
  const save = useSaveBudget();
  const remove = useDeleteBudget();

  // Budgets are for spending, so income and savings are not offered.
  const options = (categories ?? []).filter(
    (c) =>
      c.key !== "income" &&
      c.key !== "savings" &&
      (existing ? c.id === existing.category_id : !takenCategoryIds.includes(c.id)),
  );

  const [categoryId, setCategoryId] = useState<number | "">(
    existing?.category_id ?? options[0]?.id ?? "",
  );
  const [limit, setLimit] = useState(existing ? String(existing.limit_amount) : "");
  const [threshold, setThreshold] = useState(Math.round((existing?.alert_threshold ?? 0.8) * 100));
  const [error, setError] = useState<string | null>(null);
  const busy = save.isPending || remove.isPending;
  const name = (c: { name_en: string; name_bn: string }) =>
    i18n.language === "bn" ? c.name_bn : c.name_en;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse({
      category_id: categoryId === "" ? 0 : categoryId,
      limit_amount: Number(limit),
      alert_threshold: threshold / 100,
    });
    if (!parsed.success) return setError(t("budgets.invalid"));
    try {
      await save.mutateAsync(parsed.data);
      onDone();
    } catch {
      setError(t("common.error"));
    }
  }

  async function onDelete() {
    if (!existing || !window.confirm(t("budgets.confirm_delete"))) return;
    try {
      await remove.mutateAsync(existing.budget_id);
      onDone();
    } catch {
      setError(t("common.error"));
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border p-4" noValidate>
      <h2 className="font-medium">{existing ? t("budgets.edit") : t("budgets.add")}</h2>

      <div className="space-y-2">
        <Label htmlFor="budget-category">{t("budgets.category")}</Label>
        <NativeSelect
          id="budget-category"
          value={categoryId}
          disabled={Boolean(existing)}
          onChange={(e) => setCategoryId(Number(e.target.value))}
        >
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {name(c)}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="space-y-2">
        <Label htmlFor="budget-limit">{t("budgets.limit")}</Label>
        <Input
          id="budget-limit"
          inputMode="numeric"
          value={limit}
          onChange={(e) => setLimit(e.target.value.replace(/\D/g, ""))}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="budget-threshold">{t("budgets.threshold", { pct: threshold })}</Label>
        <input
          id="budget-threshold"
          type="range"
          min={50}
          max={100}
          step={5}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="accent-primary h-11 w-full"
        />
        <p className="text-muted-foreground text-xs">{t("budgets.threshold_hint")}</p>
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" className="flex-1" disabled={busy || options.length === 0}>
          {busy ? t("common.saving") : t("budgets.save")}
        </Button>
      </div>
      {existing && (
        <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={onDelete}>
          {t("budgets.delete")}
        </Button>
      )}
    </form>
  );
}
