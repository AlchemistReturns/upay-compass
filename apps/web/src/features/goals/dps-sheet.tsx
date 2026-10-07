"use client";

import { useMemo, useState } from "react";
import { CircleCheck, TriangleAlert, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DPS_TENURES, suggestSavingsPlan } from "@compass/shared";
import { OfflineNote } from "@/features/pwa/offline-note";
import { useOnline } from "@/features/pwa/use-online";
import { useLatestForecast } from "@/features/forecast/use-forecast";
import { Pill } from "@/components/compass";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/toaster";
import { formatMoney } from "@/lib/format";
import type { Goal } from "./use-goals";
import {
  useCancelSavingsPlan,
  useCreateSavingsPlan,
  useSavingsPlans,
  type SavingsPlan,
} from "./use-savings-plans";

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="text-muted-foreground min-w-0 text-[13px]">{label}</dt>
      <dd className={strong ? "num text-base font-extrabold" : "num text-sm font-bold"}>{value}</dd>
    </div>
  );
}

function PlanForm({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const online = useOnline();
  const forecast = useLatestForecast();
  const create = useCreateSavingsPlan();
  const cancel = useCancelSavingsPlan();
  const [tenure, setTenure] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [done, setDone] = useState<{ id: string; reference: string } | null>(null);

  const snapshot = forecast.data;
  const plan = useMemo(
    () =>
      suggestSavingsPlan({
        target: goal.target_amount,
        saved: goal.saved_amount,
        targetDate: goal.target_date,
        tenureMonths: tenure ?? undefined,
        forecast: snapshot
          ? {
              insufficient: snapshot.details.insufficient,
              series: snapshot.projected_balance,
              safetyBuffer: snapshot.details.safetyBuffer,
            }
          : null,
        balance: snapshot?.details.startBalance,
      }),
    [goal.target_amount, goal.saved_amount, goal.target_date, tenure, snapshot],
  );
  const verdict = plan.affordability?.verdict ?? "unknown";

  async function confirm() {
    setError(false);
    try {
      setDone(await create.mutateAsync({ goalId: goal.id, plan }));
    } catch {
      setError(true);
    }
  }

  function undo(id: string) {
    cancel.mutateAsync(id).then(
      () => {
        toast.success(t("goals.dps.toast_cancelled"));
        onClose();
      },
      () => toast.error(t("common.error")),
    );
  }

  if (done) {
    return (
      <div className="space-y-4">
        <div className="bg-muted/70 flex items-start gap-3 rounded-2xl p-4">
          <CircleCheck
            className="mt-0.5 size-5 shrink-0"
            style={{ color: "var(--status-good)" }}
            aria-hidden
          />
          <div className="min-w-0">
            <div className="font-bold">{t("goals.dps.done_title")}</div>
            <p className="text-muted-foreground mt-1 text-[13px] leading-5">
              {t("goals.dps.done_body")}
            </p>
            <div className="mt-2 text-[13px]">
              <span className="text-muted-foreground">{t("goals.dps.reference")}: </span>
              <span className="num font-bold break-all">{done.reference}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            loading={cancel.isPending}
            disabled={!online}
            onClick={() => undo(done.id)}
          >
            <Undo2 aria-hidden />
            {t("goals.undo")}
          </Button>
          <Button className="flex-1" onClick={onClose}>
            {t("goals.dps.close")}
          </Button>
        </div>
      </div>
    );
  }

  if (plan.status === "goal_reached") {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground text-sm">{t("goals.dps.goal_reached")}</p>
        <Button className="w-full" onClick={onClose}>
          {t("goals.dps.close")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-muted-foreground text-[13px] font-medium">
          {t("goals.dps.monthly")}
        </div>
        <div className="num text-3xl leading-tight font-extrabold">
          {formatMoney(plan.monthlyAmount, lang)}
        </div>
        <div className="text-muted-foreground mt-0.5 text-[13px]">
          {t("goals.dps.for_months", { months: plan.tenureMonths })}
        </div>
      </div>

      <div role="group" aria-label={t("goals.dps.tenure")} className="flex flex-wrap gap-2">
        {DPS_TENURES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={plan.tenureMonths === m}
            onClick={() => setTenure(m)}
            className="bg-secondary text-secondary-foreground hover:bg-lime-soft aria-pressed:bg-primary aria-pressed:text-primary-foreground tap num h-11 rounded-full px-4 text-[13px] font-bold"
          >
            {t("goals.dps.months_chip", { months: m })}
          </button>
        ))}
      </div>

      <dl className="divide-hairline bg-muted/60 divide-y rounded-2xl px-3.5">
        <Row label={t("goals.dps.total")} value={formatMoney(plan.totalDeposited, lang)} />
        <Row
          label={t("goals.dps.maturity")}
          value={formatMoney(plan.projectedMaturity, lang)}
          strong
        />
      </dl>

      <div className="space-y-1.5 text-[13px] leading-5">
        <div className="flex items-start gap-2">
          {verdict === "yes" ? (
            <CircleCheck
              className="mt-0.5 size-4 shrink-0"
              style={{ color: "var(--status-good)" }}
              aria-hidden
            />
          ) : (
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0"
              style={{
                color:
                  verdict === "unknown" || verdict === "insufficient"
                    ? "var(--muted-foreground)"
                    : "var(--status-warning)",
              }}
              aria-hidden
            />
          )}
          <span className="font-medium">{t(`goals.dps.afford_${verdict}`)}</span>
        </div>
        {!plan.reachesTarget && (
          <p className="text-muted-foreground pl-6">
            {t("goals.dps.short", { amount: formatMoney(plan.shortfall, lang) })}
          </p>
        )}
        {plan.meetsDate === false && (
          <p className="text-muted-foreground pl-6">{t("goals.dps.after_date")}</p>
        )}
        {plan.raisedToMinimum && (
          <p className="text-muted-foreground pl-6">
            {t("goals.dps.minimum", { amount: formatMoney(plan.monthlyAmount, lang) })}
          </p>
        )}
      </div>

      <p className="text-muted-foreground text-xs leading-5">
        {t("goals.dps.disclaimer", { rate: Math.round(plan.annualRate * 1000) / 10 })}
      </p>

      {error && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {t("common.error")}
        </p>
      )}
      <OfflineNote />
      <Button className="w-full" loading={create.isPending} disabled={!online} onClick={confirm}>
        {t("goals.dps.confirm")}
      </Button>
    </div>
  );
}

/** One tap on the goal card opens this: a plan filled in from the goal, one Confirm to request it. */
export function DpsSheet({
  goal,
  open,
  onOpenChange,
  opens,
}: {
  goal: Goal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** bumps on each open, so the form starts fresh */
  opens: number;
}) {
  const { t } = useTranslation();
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("goals.dps.title")}
      description={goal.title}
    >
      <PlanForm key={opens} goal={goal} onClose={() => onOpenChange(false)} />
    </Sheet>
  );
}

/** The goal's plans and where each stands. "Requested" means recorded in Compass, nothing more. */
export function SavingsPlansList({ goalId }: { goalId: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const plans = useSavingsPlans();
  const mine: SavingsPlan[] = (plans.data ?? []).filter((p) => p.goal_id === goalId);
  if (mine.length === 0) return null;
  return (
    <div className="mt-4">
      <h3 className="text-muted-foreground mb-1.5 px-1 text-[12px] font-semibold">
        {t("goals.dps.list_title")}
      </h3>
      <ul className="bg-muted/60 divide-hairline divide-y overflow-hidden rounded-2xl text-sm">
        {mine.map((p) => (
          <li key={p.id} className="flex items-center gap-2 px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="num font-bold">
                {t("goals.dps.plan_line", {
                  amount: formatMoney(p.monthly_amount, lang),
                  months: p.tenure_months,
                })}
              </div>
              <div className="text-muted-foreground num truncate text-xs">{p.reference}</div>
            </div>
            <Pill tone={p.status === "requested" ? "mint" : "muted"}>
              {t(`goals.dps.status_${p.status}`)}
            </Pill>
          </li>
        ))}
      </ul>
    </div>
  );
}
