"use client";

import { useState } from "react";
import { Plus, Target } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OfflineNote } from "@/features/pwa/offline-note";
import { useOnline } from "@/features/pwa/use-online";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/format";
import { useRealtimeInvalidate } from "@/features/realtime/use-realtime-invalidate";
import { GoalCard } from "./goal-card";
import { RoundupCard } from "./roundup-card";
import { useContributions, useCreateGoal, useGoals, type Goal } from "./use-goals";

/** Navy summary at the top: everything saved across goals, as a ring and in words. */
function GoalsSummary({ goals, onNew }: { goals: Goal[]; onNew: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const saved = goals.reduce((n, g) => n + Math.min(g.saved_amount, g.target_amount), 0);
  const target = goals.reduce((n, g) => n + g.target_amount, 0);
  const pct = target > 0 ? Math.round((saved / target) * 100) : 0;

  return (
    <section className="balance-panel flex items-center gap-4 p-5 sm:p-6">
      {/* the ring is decorative; the same figure is written out beside it */}
      <svg
        viewBox="0 0 36 36"
        className="relative z-[1] size-[4.5rem] shrink-0 -rotate-90"
        aria-hidden
      >
        <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="4" />
        <circle
          cx="18"
          cy="18"
          r="15"
          fill="none"
          stroke="#fff"
          strokeWidth="4"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${Math.max(pct, 2)} 100`}
        />
      </svg>
      <div className="relative z-[1] min-w-0 flex-1">
        <div className="text-[13px] text-white/80">{t("goals.saved_across")}</div>
        <div className="text-[1.75rem] leading-tight font-bold tracking-tight tabular-nums">
          {formatMoney(saved, lang)}
        </div>
        <div className="text-[13px] text-white/80 tabular-nums">
          {t("goals.of_target", { pct, amount: formatMoney(target, lang) })}
        </div>
      </div>
      <button
        type="button"
        onClick={onNew}
        className="text-brand-ink relative z-[1] flex min-h-11 shrink-0 items-center gap-1.5 self-start rounded-full bg-white px-4 text-sm font-semibold transition-colors hover:bg-white/90"
      >
        <Plus className="size-4" strokeWidth={2.5} aria-hidden />
        <span className="max-sm:sr-only">{t("goals.new")}</span>
      </button>
    </section>
  );
}

function NewGoalForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const online = useOnline();
  const create = useCreateGoal();
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(target);
    if (!title.trim() || !(amount > 0)) return setError(t("goals.invalid"));
    setError(null);
    try {
      await create.mutateAsync({
        title: title.trim(),
        target_amount: amount,
        target_date: date || null,
      });
      onDone();
    } catch {
      setError(t("common.error"));
    }
  }

  return (
    <form onSubmit={submit} className="finance-card space-y-3 p-4 sm:p-5" noValidate>
      <h2 className="section-title">{t("goals.new")}</h2>
      <div className="space-y-2">
        <Label htmlFor="goal-name">{t("goals.name")}</Label>
        <Input
          id="goal-name"
          value={title}
          placeholder={t("onboarding.goal_name_hint")}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="goal-target">{t("goals.target")}</Label>
        <Input
          id="goal-target"
          inputMode="numeric"
          value={target}
          onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="goal-by">{t("goals.date")}</Label>
        <Input id="goal-by" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <OfflineNote />
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" className="flex-1" disabled={create.isPending || !online}>
          {create.isPending ? t("common.saving") : t("goals.create")}
        </Button>
      </div>
    </form>
  );
}

export function GoalsView() {
  const { t } = useTranslation();
  const goals = useGoals();
  const contributions = useContributions();
  const [creating, setCreating] = useState(false);

  useRealtimeInvalidate("goals", [["goals"]]);
  useRealtimeInvalidate("goal_contributions", [["goals"]]);

  const loading = goals.isPending || contributions.isPending;
  const failed = goals.isError || contributions.isError;

  return (
    <>
      <PageHeader
        title={t("goals.title")}
        subtitle={
          goals.data && goals.data.length > 0
            ? t("goals.summary_counts", {
                active: goals.data.filter((g) => g.status === "active").length,
                completed: goals.data.filter((g) => g.status === "completed").length,
              })
            : undefined
        }
      />

      {loading && <p className="text-muted-foreground">{t("common.loading")}</p>}
      {failed && (
        <div>
          <p className="mb-2">{t("common.error")}</p>
          <Button
            onClick={() => {
              void goals.refetch();
              void contributions.refetch();
            }}
          >
            {t("common.retry")}
          </Button>
        </div>
      )}

      {goals.isSuccess && contributions.isSuccess && (
        <div className="space-y-4 pb-4">
          {goals.data.length > 0 && (
            <GoalsSummary goals={goals.data} onNew={() => setCreating(true)} />
          )}

          {creating && <NewGoalForm onDone={() => setCreating(false)} />}

          {goals.data.length === 0 && !creating && (
            <div className="finance-card flex flex-col items-center gap-3 px-6 py-10 text-center">
              <span className="icon-chip size-12 rounded-2xl">
                <Target className="size-6" aria-hidden />
              </span>
              <p className="text-muted-foreground max-w-xs text-sm">{t("goals.empty")}</p>
              <Button onClick={() => setCreating(true)}>
                <Plus className="size-4" aria-hidden />
                {t("goals.new")}
              </Button>
            </div>
          )}

          <div className="grid items-start gap-4 lg:grid-cols-2">
            {goals.data.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                contributions={contributions.data.filter((c) => c.goal_id === g.id)}
              />
            ))}
          </div>

          <RoundupCard goals={goals.data} contributions={contributions.data} />
        </div>
      )}
    </>
  );
}
