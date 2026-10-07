"use client";

import { useState } from "react";
import {
  ChevronDown,
  CircleCheck,
  PiggyBank,
  Plus,
  Target,
  Trash2,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { OfflineNote } from "@/features/pwa/offline-note";
import { useOnline } from "@/features/pwa/use-online";
import { projectGoal } from "@compass/shared";
import { Pill, Ring } from "@/components/compass";
import { MoneyInput } from "@/components/money-input";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm";
import { toast } from "@/components/toaster";
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
import { moneyMoveErrorKey } from "./use-savings";
import { DpsSheet, SavingsPlansList } from "./dps-sheet";

const QUICK_AMOUNTS = [100, 500, 1000] as const;

function AddMoneyForm({
  goal,
  onDone,
}: {
  goal: Goal;
  /** called with the new contribution's id and amount once it is saved */
  onDone: (added?: { id: string; amount: number }) => void;
}) {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  const contribute = useContribute();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lang = i18n.language;
  const remaining = Math.max(goal.target_amount - goal.saved_amount, 0);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!(value > 0)) return setError(t("goals.invalid_amount"));
    setError(null);
    try {
      const id = await contribute.mutateAsync({ goalId: goal.id, amount: value });
      onDone({ id, amount: value });
    } catch (e) {
      setError(t(moneyMoveErrorKey(e)));
    }
  }

  return (
    <form onSubmit={add} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor={`amt-${goal.id}`}>{t("goals.amount")}</Label>
        <MoneyInput id={`amt-${goal.id}`} value={amount} onChange={setAmount} decimal size="lg" />
      </div>
      <div className="flex flex-wrap gap-2">
        {QUICK_AMOUNTS.filter((a) => remaining === 0 || a < remaining).map((a) => (
          <button
            key={a}
            type="button"
            aria-pressed={amount === String(a)}
            onClick={() => setAmount(String(a))}
            className="bg-secondary text-secondary-foreground hover:bg-lime-soft aria-pressed:bg-primary aria-pressed:text-primary-foreground tap num h-11 rounded-full px-4 text-[13px] font-bold"
          >
            {formatMoney(a, lang)}
          </button>
        ))}
        {remaining > 0 && (
          <button
            type="button"
            aria-pressed={amount === String(Math.round(remaining))}
            onClick={() => setAmount(String(Math.round(remaining)))}
            className="bg-lime-soft text-brand-ink hover:bg-lime aria-pressed:bg-lime aria-pressed:text-brand-ink dark:text-lime dark:hover:text-brand-ink tap num h-11 rounded-full px-4 text-[13px] font-bold"
          >
            {formatMoney(remaining, lang)}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {error}
        </p>
      )}
      <OfflineNote />
      <Button
        type="submit"
        className="w-full"
        loading={contribute.isPending}
        disabled={!online || !(Number(amount) > 0)}
      >
        {t("goals.add")}
      </Button>
    </form>
  );
}

export function GoalCard({
  goal,
  contributions,
  index = 0,
}: {
  goal: Goal;
  contributions: GoalContribution[];
  index?: number;
}) {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  const lang = i18n.language;
  const undo = useUndoContribution();
  const remove = useDeleteGoal();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [opens, setOpens] = useState(0);
  const [dpsOpen, setDpsOpen] = useState(false);
  const [dpsOpens, setDpsOpens] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  // bumps on each contribution, so the ring can glow once to acknowledge it
  const [cheer, setCheer] = useState(0);

  function undoContribution(id: string) {
    undo.mutateAsync(id).then(
      () => toast.success(t("goals.toast_undone")),
      () => toast.error(t("common.error")),
    );
  }

  function onAdded(added?: { id: string; amount: number }) {
    setAdding(false);
    if (!added) return;
    setCheer((n) => n + 1);
    toast.success(
      t("goals.toast_added", { amount: formatMoney(added.amount, lang), title: goal.title }),
      { undo: { label: t("goals.undo"), onClick: () => undoContribution(added.id) } },
    );
  }

  async function onDelete() {
    const ok = await confirm({ title: t("goals.confirm_delete"), confirmLabel: t("goals.delete") });
    if (!ok) return;
    remove.mutate(goal.id, {
      onSuccess: () => toast.success(t("goals.toast_deleted")),
      onError: () => toast.error(t("common.error")),
    });
  }

  const done = goal.status === "completed";
  const pct = Math.min((goal.saved_amount / goal.target_amount) * 100, 100);
  const projection = projectGoal({
    target: goal.target_amount,
    saved: goal.saved_amount,
    targetDate: goal.target_date,
    contributions,
  });

  return (
    <section
      className="finance-card rise min-w-0 p-4 sm:p-5"
      style={{ "--i": index + 1 } as React.CSSProperties}
    >
      <div className="flex items-center gap-4">
        <div className="relative shrink-0 rounded-full">
          {cheer > 0 && (
            <span key={cheer} aria-hidden className="glow-ping absolute inset-0 rounded-full" />
          )}
          <Ring
            value={pct}
            size={72}
            stroke={7}
            color={done ? "var(--status-good)" : "var(--leaf)"}
            track="var(--mint)"
          >
            {done ? (
              <CircleCheck className="text-positive ic-draw size-6" aria-hidden />
            ) : (
              <span
                key={cheer}
                className={cn("num text-[15px] font-extrabold", cheer > 0 && "ic-beat")}
              >
                {Math.round(pct)}%
              </span>
            )}
          </Ring>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[17px] font-bold">{goal.title}</h2>
            {done && <Pill tone="good">{t("goals.status_completed")}</Pill>}
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="num text-xl leading-none font-extrabold">
              {formatMoney(goal.saved_amount, lang)}
            </span>
            <span className="text-muted-foreground num text-sm font-medium">
              / {formatMoney(goal.target_amount, lang)}
            </span>
          </div>
          {/* screen readers get the progress as a value; the ring is decorative */}
          <span
            className="sr-only"
            role="progressbar"
            aria-label={goal.title}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
          />
        </div>
      </div>

      {!done && (
        <div className="bg-muted/70 mt-4 rounded-2xl px-3.5 py-3 text-[13px] leading-5">
          {projection.status === "no_contributions" ? (
            <div className="text-muted-foreground">
              {t("goals.status_none")}
              {goal.target_date && (
                <div>
                  {t("goals.target_date", { date: formatShortDate(goal.target_date, lang) })}
                  {projection.requiredMonthly
                    ? ` · ${t("goals.need_monthly_short", { amount: formatMoney(projection.requiredMonthly, lang) })}`
                    : ""}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="flex items-start gap-2">
                {projection.status === "behind" ? (
                  <TriangleAlert
                    className="mt-0.5 size-4 shrink-0"
                    style={{ color: "var(--status-warning)" }}
                    aria-hidden
                  />
                ) : (
                  <CircleCheck
                    className="mt-0.5 size-4 shrink-0"
                    style={{ color: "var(--status-good)" }}
                    aria-hidden
                  />
                )}
                <span className="font-medium">
                  {t("goals.pace", { amount: formatMoney(projection.avgMonthly, lang) })}
                  {" · "}
                  {t(
                    projection.status === "behind"
                      ? "goals.status_behind"
                      : "goals.status_on_track",
                    {
                      date: projection.projectedDate
                        ? formatMonthYear(projection.projectedDate, lang)
                        : "-",
                    },
                  )}
                </span>
              </div>
              {projection.status === "behind" && goal.target_date && projection.requiredMonthly && (
                <div className="text-muted-foreground pl-6">
                  {t("goals.need_monthly", {
                    amount: formatMoney(projection.requiredMonthly, lang),
                    date: formatShortDate(goal.target_date, lang),
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        {!done && (
          <Button
            className="min-w-0 flex-1"
            onClick={() => {
              setOpens((n) => n + 1);
              setAdding(true);
            }}
          >
            <Plus className="ic-add" strokeWidth={2.5} aria-hidden />
            <span className="truncate">{t("goals.add_money")}</span>
          </Button>
        )}
        <Button
          variant="secondary"
          className={cn("px-4", done && "flex-1")}
          aria-expanded={showHistory}
          onClick={() => setShowHistory((v) => !v)}
        >
          <span className="max-[400px]:sr-only">{t("goals.history")}</span>
          <span className="bg-card num grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px]">
            {contributions.length}
          </span>
          <ChevronDown className={cn("ic-expand -ml-0.5 size-4")} aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-lg"
          className="text-muted-foreground hover:text-destructive hover:bg-negative-soft shrink-0"
          aria-label={t("goals.delete")}
          title={t("goals.delete")}
          disabled={remove.isPending || !online}
          onClick={() => void onDelete()}
        >
          <Trash2 className="ic-delete size-[18px]" aria-hidden />
        </Button>
      </div>

      {!done && goal.saved_amount < goal.target_amount && (
        <Button
          variant="outline"
          className="mt-2 w-full"
          onClick={() => {
            setDpsOpens((n) => n + 1);
            setDpsOpen(true);
          }}
        >
          <PiggyBank aria-hidden />
          <span className="truncate">{t("goals.dps.start")}</span>
        </Button>
      )}

      <SavingsPlansList goalId={goal.id} />

      {/* grid-rows 0fr → 1fr animates the history open to its natural height */}
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-400 ease-[cubic-bezier(0.32,0.72,0,1)]",
          showHistory ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
        inert={!showHistory}
      >
        <div className="min-h-0 overflow-hidden">
          <ul className="bg-muted/60 mt-3 divide-y divide-hairline overflow-hidden rounded-2xl text-sm">
            {contributions.length === 0 && (
              <li className="text-muted-foreground flex items-center gap-2 p-3.5">
                <Target className="size-4" aria-hidden />
                {t("goals.no_history")}
              </li>
            )}
            {contributions.map((c) => (
              <li key={c.id} className="flex items-center gap-2 py-2 pr-1.5 pl-3.5">
                <div className="min-w-0 flex-1">
                  <div className="num text-positive font-bold">+{formatMoney(c.amount, lang)}</div>
                  <div className="text-muted-foreground text-xs">
                    {formatShortDate(c.created_at, lang)} · {t(`goals.source_${c.source}`)}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={undo.isPending && undo.variables === c.id}
                  disabled={undo.isPending || !online}
                  onClick={() => undoContribution(c.id)}
                >
                  <Undo2 aria-hidden />
                  {t("goals.undo")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <DpsSheet goal={goal} open={dpsOpen} onOpenChange={setDpsOpen} opens={dpsOpens} />

      <Sheet
        open={adding}
        onOpenChange={setAdding}
        title={t("goals.add_money")}
        description={goal.title}
      >
        <AddMoneyForm key={opens} goal={goal} onDone={onAdded} />
      </Sheet>
    </section>
  );
}
