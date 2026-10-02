"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OfflineNote } from "@/features/pwa/offline-note";
import { useOnline } from "@/features/pwa/use-online";
import { projectGoal } from "@compass/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, formatMonthYear, formatShortDate } from "@/lib/format";
import {
  useContribute,
  useDeleteGoal,
  useUndoContribution,
  type Goal,
  type GoalContribution,
} from "./use-goals";

export function GoalCard({
  goal,
  contributions,
}: {
  goal: Goal;
  contributions: GoalContribution[];
}) {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  const lang = i18n.language;
  const contribute = useContribute();
  const undo = useUndoContribution();
  const remove = useDeleteGoal();
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = goal.status === "completed";
  const pct = Math.min((goal.saved_amount / goal.target_amount) * 100, 100);
  const projection = projectGoal({
    target: goal.target_amount,
    saved: goal.saved_amount,
    targetDate: goal.target_date,
    contributions,
  });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!(value > 0)) return setError(t("goals.invalid_amount"));
    setError(null);
    try {
      await contribute.mutateAsync({ goalId: goal.id, amount: value });
      setAmount("");
      setAdding(false);
    } catch {
      setError(t("common.error"));
    }
  }

  return (
    <section className="rounded-xl border p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-medium">{goal.title}</h2>
        <span className="text-sm tabular-nums">
          {formatMoney(goal.saved_amount, lang)}
          <span className="text-muted-foreground"> / {formatMoney(goal.target_amount, lang)}</span>
        </span>
      </div>

      <div
        className="bg-muted mt-2 h-2.5 rounded-r-full rounded-l-sm"
        role="progressbar"
        aria-label={goal.title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div
          className="h-full rounded-r-full rounded-l-sm"
          style={{
            width: `${Math.max(pct, 1.5)}%`,
            background: done ? "var(--status-good)" : "var(--chart-bar)",
          }}
        />
      </div>

      <div className="mt-2 text-xs">
        {done ? (
          <span className="flex items-center gap-1.5">
            <CheckCircle2
              className="size-3.5"
              style={{ color: "var(--status-good)" }}
              aria-hidden
            />
            {t("goals.status_completed")}
          </span>
        ) : projection.status === "no_contributions" ? (
          <span className="text-muted-foreground">{t("goals.status_none")}</span>
        ) : (
          <div className="space-y-0.5">
            <div>
              {t("goals.pace", { amount: formatMoney(projection.avgMonthly, lang) })}
              {" · "}
              {t(projection.status === "behind" ? "goals.status_behind" : "goals.status_on_track", {
                date: projection.projectedDate
                  ? formatMonthYear(projection.projectedDate, lang)
                  : "-",
              })}
            </div>
            {projection.status === "behind" && goal.target_date && projection.requiredMonthly && (
              <div className="text-muted-foreground">
                {t("goals.need_monthly", {
                  amount: formatMoney(projection.requiredMonthly, lang),
                  date: formatShortDate(goal.target_date, lang),
                })}
              </div>
            )}
          </div>
        )}
        {goal.target_date && !done && projection.status === "no_contributions" && (
          <div className="text-muted-foreground">
            {t("goals.target_date", { date: formatShortDate(goal.target_date, lang) })}
            {projection.requiredMonthly
              ? ` · ${t("goals.need_monthly_short", { amount: formatMoney(projection.requiredMonthly, lang) })}`
              : ""}
          </div>
        )}
      </div>

      {adding ? (
        <form onSubmit={add} className="mt-3 space-y-2" noValidate>
          <Label htmlFor={`amt-${goal.id}`}>{t("goals.amount")}</Label>
          <Input
            id={`amt-${goal.id}`}
            inputMode="decimal"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          />
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <OfflineNote />
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setAdding(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" className="flex-1" disabled={contribute.isPending || !online}>
              {t("goals.add")}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">{t("goals.simulated")}</p>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {!done && (
            <Button size="sm" onClick={() => setAdding(true)}>
              {t("goals.add_money")}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowHistory((v) => !v)}>
            {t("goals.history")} ({contributions.length})
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={remove.isPending || !online}
            onClick={() => window.confirm(t("goals.confirm_delete")) && remove.mutate(goal.id)}
          >
            {t("goals.delete")}
          </Button>
        </div>
      )}

      {showHistory && (
        <ul className="mt-3 divide-y rounded-lg border text-sm">
          {contributions.length === 0 && (
            <li className="text-muted-foreground p-3">{t("goals.no_history")}</li>
          )}
          {contributions.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="tabular-nums">+{formatMoney(c.amount, lang)}</div>
                <div className="text-muted-foreground text-xs">
                  {formatShortDate(c.created_at, lang)} · {t(`goals.source_${c.source}`)}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={undo.isPending || !online}
                onClick={() => undo.mutate(c.id)}
              >
                {t("goals.undo")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
