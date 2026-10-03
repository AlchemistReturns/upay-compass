"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SectionHeader } from "@/components/compass";
import { cn } from "@/lib/utils";

export type ScoreChange = { component: string; from: number; to: number; points: number };

/**
 * "What moved your score": the per-component change since the previous snapshot. Shared by the
 * health score and the readiness scorecard; `label` turns a component key into its name.
 */
export function ScoreMoved({
  hasPrevious,
  changes,
  label,
  id = "moved-heading",
}: {
  hasPrevious: boolean;
  changes: ScoreChange[];
  label: (component: string) => string;
  id?: string;
}) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby={id}>
      <SectionHeader id={id} title={t("score.moved")} />
      <div className="finance-card p-4">
        {!hasPrevious ? (
          <p className="text-muted-foreground text-sm">{t("score.moved_first")}</p>
        ) : changes.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("score.moved_none")}</p>
        ) : (
          <ul className="divide-y divide-[rgba(13,75,76,.07)] text-sm">
            {changes.map((c) => (
              <li key={c.component} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full",
                    c.points > 0
                      ? "bg-positive-soft text-positive"
                      : "bg-negative-soft text-destructive",
                  )}
                >
                  {c.points > 0 ? (
                    <ArrowUp className="size-3.5" aria-hidden />
                  ) : (
                    <ArrowDown className="size-3.5" aria-hidden />
                  )}
                </span>
                <span className="flex-1">
                  {label(c.component)}
                  <span className="text-muted-foreground num ml-1.5 text-xs">
                    {c.from} → {c.to}
                  </span>
                </span>
                <span className="num font-bold">
                  {c.points > 0 ? "+" : "−"}
                  {Math.abs(c.points)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
