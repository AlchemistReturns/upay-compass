"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Target, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OfflineNote } from "@/features/pwa/offline-note";
import { useOnline } from "@/features/pwa/use-online";
import { projectGoal } from "@compass/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, formatMonthYear, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
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
    <section className="finance-card p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span
          className={cn("icon-chip size-11 rounded-2xl", done && "bg-positive-soft text-positive")}
        >
          <Target className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="section-title truncate">{goal.title}</h2>
          <div className="text-sm tabular-nums">
            <span className="font-semibold">{formatMoney(goal.saved_amount, lang)}</span>
            <span className="text-muted-foreground">
              {" "}
              / {formatMoney(goal.target_amount, lang)}
            </span>
          </div>
        </div>
        <span
          className={cn("text-lg font-bold tabular-nums", done ? "text-positive" : "text-primary")}
          aria-hidden
        >
          {Math.round(pct)}%
        </span>
      </div>

      <div
        className="bg-muted mt-3.5 h-2.5 rounded-full"
        role="progressbar"
        aria-label={goal.title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${Math.max(pct, 1.5)}%`,
            background: done ? "var(--status-good)" : "var(--chart-bar)",
          }}
        />
      </div>

      <div className="mt-2.5 text-xs leading-5">
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
            <div className="flex items-start gap-1.5">
              {projection.status === "behind" ? (
                <AlertTriangle
                  className="mt-0.5 size-3.5 shrink-0"
                  style={{ color: "var(--status-warning)" }}
                  aria-hidden
                />
              ) : (
                <CheckCircle2
                  className="mt-0.5 size-3.5 shrink-0"
                  style={{ color: "var(--status-good)" }}
                  aria-hidden
                />
              )}
              <span>
                {t("goals.pace", { amount: formatMoney(projection.avgMonthly, lang) })}
                {" · "}
                {t(
                  projection.status === "behind" ? "goals.status_behind" : "goals.status_on_track",
                  {
                    date: projection.projectedDate
                      ? formatMonthYear(projection.projectedDate, lang)
                      : "-",
                  },
                )}
              </span>
            </div>
            {projection.status === "behind" && goal.target_date && projection.requiredMonthly && (
              <div className="text-muted-foreground pl-5">
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
        <div className="mt-4 flex gap-2">
          {!done && (
            <Button className="flex-1" onClick={() => setAdding(true)}>
              {t("goals.add_money")}
            </Button>
          )}
          <Button
            variant="outline"
            className={cn(done && "flex-1")}
            aria-expanded={showHistory}
            onClick={() => setShowHistory((v) => !v)}
          >
            {t("goals.history")} ({contributions.length})
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive shrink-0"
            aria-label={t("goals.delete")}
            title={t("goals.delete")}
            disabled={remove.isPending || !online}
            onClick={() => window.confirm(t("goals.confirm_delete")) && remove.mutate(goal.id)}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      )}

      {showHistory && (
        <ul className="bg-muted/50 mt-3 divide-y overflow-hidden rounded-2xl text-sm">
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
