"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OfflineNote } from "@/features/pwa/offline-note";
import { useOnline } from "@/features/pwa/use-online";
import { z } from "zod";
import { CategoryIcon } from "@/components/compass";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm";
import { toast } from "@/components/toaster";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/money-input";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
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
  const online = useOnline();
  const { data: categories } = useCategories();
  const save = useSaveBudget();
  const remove = useDeleteBudget();
  const confirm = useConfirm();

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
      const id = await save.mutateAsync(parsed.data);
      // undo puts back the earlier limit, or removes the budget if it was new
      const undo = () =>
        existing
          ? save.mutateAsync({
              category_id: existing.category_id,
              limit_amount: existing.limit_amount,
              alert_threshold: existing.alert_threshold,
            })
          : remove.mutateAsync(id);
      toast.success(t("budgets.toast_saved"), {
        undo: {
          label: t("common.undo"),
          onClick: () => void undo().catch(() => toast.error(t("common.error"))),
        },
      });
      onDone();
    } catch {
      setError(t("common.error"));
    }
  }

  async function onDelete() {
    if (!existing) return;
    const ok = await confirm({
      title: t("budgets.confirm_delete"),
      confirmLabel: t("budgets.delete"),
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(existing.budget_id);
      toast.success(t("budgets.toast_deleted"), {
        undo: {
          label: t("common.undo"),
          onClick: () =>
            void save
              .mutateAsync({
                category_id: existing.category_id,
                limit_amount: existing.limit_amount,
                alert_threshold: existing.alert_threshold,
              })
              .catch(() => toast.error(t("common.error"))),
        },
      });
      onDone();
    } catch {
      setError(t("common.error"));
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <fieldset className="space-y-2.5">
        <legend className="text-foreground/85 mb-2.5 px-1 text-[13px] font-semibold">
          {t("budgets.category")}
        </legend>
        <div
          role="radiogroup"
          aria-label={t("budgets.category")}
          className="grid grid-cols-3 gap-2"
        >
          {options.map((c) => {
            const selected = categoryId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={Boolean(existing)}
                onClick={() => {
                  haptic("light");
                  setCategoryId(c.id);
                }}
                className={cn(
                  "flex min-h-[5.25rem] flex-col items-center justify-center gap-1.5 rounded-2xl border px-1.5 py-2.5 text-center text-[12px] leading-tight font-semibold tap disabled:cursor-default",
                  selected
                    ? "border-primary bg-secondary shadow-[0_0_0_3px_rgba(255, 194, 14,.7)]"
                    : "bg-card border-hairline-strong hover:border-primary/30",
                )}
              >
                <CategoryIcon
                  // re-keyed so the chosen category's icon springs once
                  key={selected ? "on" : "off"}
                  categoryKey={c.key}
                  className={cn("size-9 rounded-xl", selected && "pop-spring")}
                  iconClassName="size-4"
                />
                <span className="line-clamp-2">{name(c)}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="budget-limit">{t("budgets.limit")}</Label>
        <MoneyInput id="budget-limit" value={limit} onChange={setLimit} />
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
          className="accent-primary h-11 w-full cursor-pointer"
        />
        <p className="text-muted-foreground px-1 text-xs">{t("budgets.threshold_hint")}</p>
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {error}
        </p>
      )}
      <OfflineNote />

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="secondary" disabled={busy} onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button
          type="submit"
          className="flex-1"
          loading={save.isPending}
          disabled={busy || !online || options.length === 0}
        >
          {t("budgets.save")}
        </Button>
      </div>
      {existing && (
        <Button
          type="button"
          variant="destructive"
          className="w-full"
          loading={remove.isPending}
          disabled={busy || !online}
          onClick={() => void onDelete()}
        >
          <Trash2 aria-hidden />
          {t("budgets.delete")}
        </Button>
      )}
    </form>
  );
}
