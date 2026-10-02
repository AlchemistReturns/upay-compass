"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OfflineNote } from "@/features/pwa/offline-note";
import { useOnline } from "@/features/pwa/use-online";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRealtimeInvalidate } from "@/features/realtime/use-realtime-invalidate";
import { GoalCard } from "./goal-card";
import { RoundupCard } from "./roundup-card";
import { useContributions, useCreateGoal, useGoals } from "./use-goals";

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
    <form onSubmit={submit} className="space-y-3 rounded-xl border p-4" noValidate>
      <h2 className="font-medium">{t("goals.new")}</h2>
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
      <PageHeader title={t("goals.title")} />

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
        <div className="space-y-3 pb-4">
          {creating ? (
            <NewGoalForm onDone={() => setCreating(false)} />
          ) : (
            <Button className="h-11 w-full" onClick={() => setCreating(true)}>
              <Plus className="mr-1 size-4" aria-hidden />
              {t("goals.new")}
            </Button>
          )}

          {goals.data.length === 0 && !creating && (
            <p className="text-muted-foreground text-sm">{t("goals.empty")}</p>
          )}

          {goals.data.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              contributions={contributions.data.filter((c) => c.goal_id === g.id)}
            />
          ))}

          <RoundupCard goals={goals.data} contributions={contributions.data} />
        </div>
      )}
    </>
  );
}
