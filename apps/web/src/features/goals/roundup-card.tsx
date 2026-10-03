"use client";

import { useState } from "react";
import { Coins } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOnline } from "@/features/pwa/use-online";
import { Switch } from "@/components/switch";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/toaster";
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
      const wasEnabled = enabled;
      await setRoundup.mutateAsync({ enabled: next, goalId: target });
      if (next !== wasEnabled) {
        toast.success(t(next ? "goals.toast_roundup_on" : "goals.toast_roundup_off"));
      }
    } catch {
      setError(t("common.error"));
    }
  }

  return (
    <section
      className={cn(
        "rise overflow-hidden rounded-[1.75rem] p-4 transition-[background,box-shadow] duration-500 sm:p-5",
        enabled ? "surface-lime shadow-[0_16px_34px_-20px_rgba(79,158,58,.9)]" : "finance-card",
      )}
      style={{ "--i": 3 } as React.CSSProperties}
    >
      <div className="flex items-start gap-3.5">
        <span
          className={cn(
            "grid size-12 shrink-0 place-items-center rounded-2xl transition-colors duration-500",
            enabled ? "text-lime bg-[image:var(--gradient-teal)]" : "bg-secondary text-primary",
          )}
        >
          {/* the coin flips over when round-ups switch on or off */}
          <Coins key={String(enabled)} className="ic-flip-in size-[22px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="text-[17px] font-bold">{t("goals.roundup_title")}</h2>
          {rounded.length > 0 ? (
            <p className="num mt-0.5 text-sm font-semibold">
              {t("goals.roundup_total", {
                amount: formatMoney(total, lang),
                count: rounded.length,
              })}
            </p>
          ) : (
            <p
              className={cn(
                "mt-0.5 text-sm leading-5",
                enabled ? "text-brand-ink/75" : "text-muted-foreground",
              )}
            >
              {t("goals.roundup_example")}
            </p>
          )}
        </div>
        <Switch
          checked={enabled}
          label={t("goals.roundup_title")}
          disabled={!online || setRoundup.isPending || (active.length === 0 && !enabled)}
          onChange={(next) => void apply(next, next ? selected || null : null)}
        />
      </div>

      {active.length === 0 ? (
        <p className="text-muted-foreground mt-4 text-sm">{t("goals.roundup_need_goal")}</p>
      ) : (
        <div className="mt-4 space-y-2">
          <Label htmlFor="roundup-goal">{t("goals.roundup_goal")}</Label>
          <NativeSelect
            id="roundup-goal"
            value={selected}
            disabled={!online || setRoundup.isPending}
            className={cn(enabled && "border-brand-ink/10")}
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

      <p
        className={cn(
          "mt-3 px-1 text-xs leading-5",
          enabled ? "text-brand-ink/70" : "text-muted-foreground",
        )}
      >
        {t("goals.roundup_body")} {t("goals.simulated")}
      </p>
      {error && (
        <p role="alert" className="text-destructive mt-2 text-sm">
          {error}
        </p>
      )}
    </section>
  );
}
