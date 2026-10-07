"use client";

import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { NAV_FORWARD } from "@/components/page-transition";
import { useBudgetProgress } from "@/features/budgets/use-budgets";
import { useGoals } from "@/features/goals/use-goals";

type Step = { key: string; done: boolean; href: string };

/**
 * A short "get started" list on Home: add a payment, set a budget, set a goal. Each step ticks
 * itself off from the person's own data, and the card disappears once all three are done.
 */
export function GetStarted({ hasTransactions }: { hasTransactions: boolean }) {
  const { t } = useTranslation();
  const budgets = useBudgetProgress();
  const goals = useGoals();
  // wait for both lists, so the card never flashes for someone who already has them
  if (!budgets.isSuccess || !goals.isSuccess) return null;

  const steps: Step[] = [
    { key: "payment", done: hasTransactions, href: "/transactions/new" },
    { key: "budget", done: budgets.data.length > 0, href: "/plan?tab=budgets" },
    { key: "goal", done: goals.data.length > 0, href: "/plan?tab=goals" },
  ];
  const left = steps.filter((s) => !s.done).length;
  if (left === 0) return null;

  return (
    <section aria-labelledby="start-heading" className="finance-card space-y-1 p-4">
      <div className="flex items-baseline justify-between gap-3 px-1 pb-1">
        <h2 id="start-heading" className="text-base font-extrabold">
          {t("start.title")}
        </h2>
        <span className="text-muted-foreground num text-xs font-semibold">
          {t("start.progress", { done: steps.length - left, total: steps.length })}
        </span>
      </div>
      <ul className="divide-border divide-y">
        {steps.map((s) => (
          <li key={s.key}>
            {s.done ? (
              <div className="text-muted-foreground flex items-center gap-3 py-3 text-sm">
                <Check className="text-positive size-5 shrink-0" strokeWidth={2.6} aria-hidden />
                <span className="line-through">{t(`start.${s.key}`)}</span>
                <span className="sr-only">{t("start.done")}</span>
              </div>
            ) : (
              <Link
                href={s.href}
                transitionTypes={NAV_FORWARD}
                className={cn("flex items-center gap-3 py-3 text-sm font-semibold")}
              >
                <span
                  className="border-foreground/25 size-5 shrink-0 rounded-full border-2"
                  aria-hidden
                />
                <span className="flex-1">{t(`start.${s.key}`)}</span>
                <ChevronRight className="text-muted-foreground/60 size-5" aria-hidden />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
