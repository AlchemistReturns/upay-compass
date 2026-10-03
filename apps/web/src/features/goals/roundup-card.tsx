"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOnline } from "@/features/pwa/use-online";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/auth-provider";
import { useProfile } from "@/features/profile/use-profile";
import { useSetRoundup, type Goal, type GoalContribution } from "./use-goals";

/** Opt-in and reversible: each outgoing payment is rounded up to the next ৳10 and the difference is set aside. */
export function RoundupCard({
  goals,
  contributions,
}: {
  goals: Goal[];
  contributions: GoalContribution[];
}) {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  const lang = i18n.language;
  const { userId } = useAuth();
  const profile = useProfile(userId);
  const setRoundup = useSetRoundup();
  const [error, setError] = useState<string | null>(null);

  const active = goals.filter((g) => g.status === "active");
  const goalId = profile.data?.roundup_goal_id ?? null;
  // On only if a live goal is attached (a deleted goal switches round-ups off in effect).
  const enabled = Boolean(profile.data?.roundup_enabled && active.some((g) => g.id === goalId));
  const [choice, setChoice] = useState<string>("");
  const selected =
    goalId && active.some((g) => g.id === goalId) ? goalId : choice || active[0]?.id || "";

  const rounded = contributions.filter((c) => c.source === "roundup");
  const total = rounded.reduce((n, c) => n + c.amount, 0);

  async function apply(next: boolean, target: string | null) {
    setError(null);
    try {
      await setRoundup.mutateAsync({ enabled: next, goalId: target });
    } catch {
      setError(t("common.error"));
    }
  }

  return (
    <section
      className={cn(
        "finance-card p-4 sm:p-5",
        // amber while it is on: round-ups are a reward-style habit
        enabled && "border-[#f6dca3]! [background:var(--reward-soft)]!",
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn("icon-chip size-11 rounded-2xl", enabled && "bg-reward text-white")}>
          <RefreshCw className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="section-title">{t("goals.roundup_title")}</h2>
          {rounded.length > 0 ? (
            <p className={cn("mt-0.5 text-sm font-medium", enabled && "text-reward-ink")}>
              {t("goals.roundup_total", {
                amount: formatMoney(total, lang),
                count: rounded.length,
              })}
            </p>
          ) : (
            <p className="text-muted-foreground mt-0.5 text-sm">{t("goals.roundup_body")}</p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t("goals.roundup_title")}
          disabled={!online || setRoundup.isPending || (active.length === 0 && !enabled)}
          onClick={() => void apply(!enabled, enabled ? null : selected || null)}
          className="relative h-11 w-14 shrink-0 disabled:opacity-50"
        >
          <span
            className={`absolute inset-x-0 top-1.5 h-8 rounded-full transition-colors ${
              enabled ? "bg-reward-ink" : "bg-muted-foreground/30"
            }`}
          />
          <span
            className={`bg-background absolute top-2.5 size-6 rounded-full shadow transition-all ${
              enabled ? "left-7" : "left-1"
            }`}
          />
        </button>
      </div>

      {active.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-sm">{t("goals.roundup_need_goal")}</p>
      ) : (
        <div className="mt-3 space-y-2">
          <Label htmlFor="roundup-goal">{t("goals.roundup_goal")}</Label>
          <NativeSelect
            id="roundup-goal"
            value={selected}
            disabled={!online || setRoundup.isPending}
            onChange={(e) => {
              setChoice(e.target.value);
              if (enabled) void apply(true, e.target.value);
            }}
          >
            {active.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      {rounded.length > 0 && (
        <p className="text-muted-foreground mt-3 text-xs leading-5">{t("goals.roundup_body")}</p>
      )}
      {error && (
        <p role="alert" className="text-destructive mt-2 text-sm">
          {error}
        </p>
      )}
      <p className="text-muted-foreground mt-2 text-xs">{t("goals.simulated")}</p>
    </section>
  );
}
