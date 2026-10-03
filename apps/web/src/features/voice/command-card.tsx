"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { addDays, dhakaDay, type Command } from "@compass/shared";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { formatMoney, formatShortDate } from "@/lib/format";
import { useCategories } from "@/features/categories/use-categories";
import { useBudgetProgress } from "@/features/budgets/use-budgets";
import type { CandidateTransaction } from "./use-voice-command";

type Editable = Exclude<Command, { intent: "ask_coach" }>;

const asNumber = (text: string) => {
  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
};

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

/**
 * The confirmation card: what the app understood, in editable fields. Nothing runs until the
 * person taps the button, and removing a payment needs them to pick one first.
 */
export function CommandCard({
  command,
  candidates,
  busy,
  onConfirm,
  onCancel,
}: {
  command: Editable;
  candidates: CandidateTransaction[];
  busy: boolean;
  onConfirm: (command: Editable, extra: { deleteId?: string }) => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { data: categories } = useCategories();
  const budgets = useBudgetProgress();
  const today = dhakaDay(new Date());
  const tomorrow = addDays(today, 1);

  const [draft, setDraft] = useState<Editable>(command);
  const [amountText, setAmountText] = useState(() => {
    switch (command.intent) {
      case "add_transaction":
      case "add_to_goal":
        return String(command.amount);
      case "create_budget":
        return String(command.limit);
      case "create_goal":
        return String(command.target);
      default:
        return "";
    }
  });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const name = (c: { name_en: string; name_bn: string }) => (lang === "bn" ? c.name_bn : c.name_en);
  const amount = asNumber(amountText);
  const spending = (categories ?? []).filter((c) => c.key !== "income" && c.key !== "savings");

  let title = "";
  let fields: React.ReactNode = null;
  let valid = amount > 0;
  let confirmLabel = t("voice.confirm");
  let destructive = false;
  let build: () => Editable = () => draft;

  switch (draft.intent) {
    case "add_transaction": {
      const d = draft;
      title = d.direction === "in" ? t("voice.add_income") : t("voice.add_expense");
      valid = amount > 0 && d.date <= today;
      build = () => ({ ...d, amount });
      fields = (
        <>
          <div
            className="bg-secondary flex gap-1 rounded-full p-1"
            role="group"
            aria-label={t("voice.direction")}
          >
            {(["out", "in"] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                aria-pressed={d.direction === dir}
                onClick={() =>
                  setDraft({
                    ...d,
                    direction: dir,
                    category:
                      dir === "in" ? "income" : d.category === "income" ? "other" : d.category,
                  })
                }
                className={cn(
                  "min-h-11 flex-1 rounded-full text-sm font-semibold transition-colors",
                  d.direction === dir
                    ? "bg-elevated text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                {dir === "out" ? t("voice.spent") : t("voice.received")}
              </button>
            ))}
          </div>
          <Field label={t("voice.amount")} htmlFor="vc-amount">
            <MoneyInput id="vc-amount" value={amountText} onChange={setAmountText} decimal />
          </Field>
          <Field label={t("voice.merchant")} htmlFor="vc-merchant">
            <Input
              id="vc-merchant"
              maxLength={80}
              value={d.merchant}
              onChange={(e) => setDraft({ ...d, merchant: e.target.value })}
            />
          </Field>
          <Field label={t("voice.category")} htmlFor="vc-category">
            <NativeSelect
              id="vc-category"
              value={d.category}
              onChange={(e) => setDraft({ ...d, category: e.target.value as typeof d.category })}
              disabled={d.direction === "in"}
            >
              {(d.direction === "in"
                ? (categories ?? []).filter((c) => c.key === "income")
                : spending
              ).map((c) => (
                <option key={c.key} value={c.key}>
                  {name(c)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("voice.date")} htmlFor="vc-date">
            <Input
              id="vc-date"
              type="date"
              max={today}
              value={d.date}
              onChange={(e) => setDraft({ ...d, date: e.target.value || today })}
            />
          </Field>
        </>
      );
      break;
    }

    case "create_budget": {
      const d = draft;
      const current = budgets.data?.find(
        (b) => categories?.find((c) => c.id === b.category_id)?.key === d.category,
      );
      const cat = categories?.find((c) => c.key === d.category);
      title = current ? t("voice.update_budget") : t("voice.set_budget");
      valid = amount > 0;
      build = () => ({ ...d, limit: amount });
      fields = (
        <>
          <Field label={t("voice.category")} htmlFor="vc-category">
            <NativeSelect
              id="vc-category"
              value={d.category}
              onChange={(e) => setDraft({ ...d, category: e.target.value as typeof d.category })}
            >
              {spending.map((c) => (
                <option key={c.key} value={c.key}>
                  {name(c)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("voice.monthly_limit")} htmlFor="vc-amount">
            <MoneyInput id="vc-amount" value={amountText} onChange={setAmountText} decimal />
          </Field>
          {current && cat && (
            <p className="text-muted-foreground text-sm">
              {t("voice.budget_exists", {
                category: name(cat),
                current: formatMoney(current.limit_amount, lang),
              })}
            </p>
          )}
        </>
      );
      break;
    }

    case "create_goal": {
      const d = draft;
      title = t("voice.create_goal");
      valid =
        amount > 0 && d.title.trim().length > 0 && (!d.targetDate || d.targetDate >= tomorrow);
      build = () => ({ ...d, target: amount });
      fields = (
        <>
          <Field label={t("voice.goal_name")} htmlFor="vc-title">
            <Input
              id="vc-title"
              maxLength={80}
              value={d.title}
              onChange={(e) => setDraft({ ...d, title: e.target.value })}
            />
          </Field>
          <Field label={t("voice.target")} htmlFor="vc-amount">
            <MoneyInput id="vc-amount" value={amountText} onChange={setAmountText} decimal />
          </Field>
          <Field label={t("voice.target_date")} htmlFor="vc-target-date">
            <Input
              id="vc-target-date"
              type="date"
              min={tomorrow}
              value={d.targetDate ?? ""}
              onChange={(e) => setDraft({ ...d, targetDate: e.target.value || null })}
            />
          </Field>
        </>
      );
      break;
    }

    case "add_to_goal": {
      const d = draft;
      title = t("voice.add_to_goal");
      valid = amount > 0 && d.goalId !== null;
      build = () => ({ ...d, amount });
      fields = (
        <>
          <Field label={t("voice.goal")} htmlFor="vc-goal">
            <NativeSelect
              id="vc-goal"
              value={d.goalId ?? ""}
              onChange={(e) => setDraft({ ...d, goalId: e.target.value || null })}
            >
              {d.goalId === null && <option value="">{t("voice.choose_goal")}</option>}
              {d.goalCandidates.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("voice.amount")} htmlFor="vc-amount">
            <MoneyInput id="vc-amount" value={amountText} onChange={setAmountText} decimal />
          </Field>
        </>
      );
      break;
    }

    case "delete_transaction": {
      title = t("voice.delete_title");
      valid = deleteId !== null;
      confirmLabel = t("voice.delete_confirm");
      destructive = true;
      fields =
        candidates.length === 0 ? (
          <p className="text-muted-foreground text-sm" role="status">
            {t("voice.delete_none")}
          </p>
        ) : (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold">{t("voice.delete_pick")}</legend>
            {candidates.map((c) => {
              const cat = categories?.find((x) => x.id === c.category_id);
              const selected = deleteId === c.id;
              return (
                <label
                  key={c.id}
                  className={cn(
                    "finance-card flex min-h-14 cursor-pointer items-center gap-3 p-3",
                    selected && "ring-primary ring-2",
                  )}
                >
                  <input
                    type="radio"
                    name="vc-delete"
                    className="accent-primary size-5"
                    checked={selected}
                    onChange={() => setDeleteId(c.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">
                      {c.counterparty || t("transactions.unknown_merchant")}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {formatShortDate(c.occurred_at, lang)}
                      {cat ? ` · ${name(cat)}` : ""}
                    </span>
                  </span>
                  <span className="num font-bold">
                    {c.direction === "in" ? "+" : "−"}
                    {formatMoney(c.amount, lang)}
                  </span>
                </label>
              );
            })}
          </fieldset>
        );
      break;
    }
  }

  return (
    <section aria-label={title} className="space-y-4" data-testid="command-card">
      <h3 className="text-lg font-bold tracking-tight">{title}</h3>
      <div className="space-y-3">{fields}</div>
      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onCancel}
          disabled={busy}
        >
          {t("voice.cancel")}
        </Button>
        <Button
          type="button"
          variant={destructive ? "destructive" : "default"}
          className="flex-[1.4]"
          loading={busy}
          disabled={!valid || busy}
          onClick={() => onConfirm(build(), { deleteId: deleteId ?? undefined })}
        >
          {confirmLabel}
        </Button>
      </div>
    </section>
  );
}
