"use client";

import { useState } from "react";
import { Plus, Target } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OfflineNote } from "@/features/pwa/offline-note";
import { useOnline } from "@/features/pwa/use-online";
import { PageHeader, TOOLBAR_BUTTON } from "@/components/page-header";
import { AnimatedNumber, EmptyState, ErrorState, LoadingCards, Ring } from "@/components/compass";
import { MoneyInput } from "@/components/money-input";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/toaster";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/format";
import { useRealtimeInvalidate } from "@/features/realtime/use-realtime-invalidate";
import { GoalCard } from "./goal-card";
import { RoundupCard } from "./roundup-card";
import { useContributions, useCreateGoal, useGoals, type Goal } from "./use-goals";

/** Teal summary at the top: everything saved across goals, as a ring and in words. */
function GoalsSummary({ goals, onNew }: { goals: Goal[]; onNew: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const saved = goals.reduce((n, g) => n + Math.min(g.saved_amount, g.target_amount), 0);
  const target = goals.reduce((n, g) => n + g.target_amount, 0);
  const pct = target > 0 ? Math.round((saved / target) * 100) : 0;

  return (
    <section className="balance-panel rise flex items-center gap-5 p-5 sm:gap-7 sm:p-7">
      <Ring value={pct} size={104} stroke={10} track="rgba(255,255,255,.1)" color="var(--lime)">
        <span className="num text-2xl leading-none font-extrabold">{pct}%</span>
      </Ring>
      <div className="min-w-0 flex-1">
        <div className="text-on-dark-muted text-[13px] font-semibold">
          {t("goals.saved_across")}
        </div>
        <div className="mt-1 text-[1.75rem] leading-none font-extrabold tracking-tight sm:text-[2rem]">
          <AnimatedNumber value={saved} format={(n) => formatMoney(n, lang)} />
        </div>
        <div className="text-on-dark-muted num mt-1.5 text-[13px]">
          {t("goals.of_target", { pct, amount: formatMoney(target, lang) })}
        </div>
        <Button variant="onDark" size="sm" className="mt-4" onClick={onNew}>
          <Plus strokeWidth={2.5} aria-hidden />
          {t("goals.new")}
        </Button>
      </div>
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
      toast.success(t("goals.toast_created"));
      onDone();
    } catch {
      setError(t("common.error"));
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
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
        <MoneyInput id="goal-target" value={target} onChange={setTarget} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="goal-by">{t("goals.date")}</Label>
        <Input id="goal-by" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {error}
        </p>
      )}
      <OfflineNote />
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" className="flex-1" loading={create.isPending} disabled={!online}>
          {t("goals.create")}
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
  const [opens, setOpens] = useState(0);

  useRealtimeInvalidate("goals", [["goals"]]);
  useRealtimeInvalidate("goal_contributions", [["goals"]]);

  const loading = goals.isPending || contributions.isPending;
  const failed = goals.isError || contributions.isError;

  function startNew() {
    setOpens((n) => n + 1);
    setCreating(true);
  }

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
        actions={
          goals.isSuccess && (
            <button
              type="button"
              className={TOOLBAR_BUTTON}
              aria-label={t("goals.new")}
              title={t("goals.new")}
              onClick={startNew}
            >
              <Plus className="size-5" aria-hidden />
            </button>
          )
        }
      />

      {loading && !failed && <LoadingCards hero rows={2} />}
      {failed && (
        <ErrorState
          onRetry={() => {
            void goals.refetch();
            void contributions.refetch();
          }}
        />
      )}

      {goals.isSuccess && contributions.isSuccess && (
        <div className="space-y-5 pb-4">
          {goals.data.length > 0 ? (
            <GoalsSummary goals={goals.data} onNew={startNew} />
          ) : (
            <EmptyState
              icon={Target}
              title={t("goals.new")}
              body={t("goals.empty")}
              action={
                <Button onClick={startNew}>
                  <Plus aria-hidden />
                  {t("goals.new")}
                </Button>
              }
            />
          )}

          {goals.data.length > 0 && (
            <div className="grid items-start gap-3 lg:grid-cols-2 [&>*]:min-w-0 [&>*:only-child]:col-span-full">
              {goals.data.map((g, i) => (
                <GoalCard
                  key={g.id}
                  goal={g}
                  index={i}
                  contributions={contributions.data.filter((c) => c.goal_id === g.id)}
                />
              ))}
            </div>
          )}

          <RoundupCard goals={goals.data} contributions={contributions.data} />
        </div>
      )}

      <Sheet open={creating} onOpenChange={setCreating} title={t("goals.new")}>
        <NewGoalForm key={opens} onDone={() => setCreating(false)} />
      </Sheet>
    </>
  );
}
