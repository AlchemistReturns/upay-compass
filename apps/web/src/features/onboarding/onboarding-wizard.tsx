"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { INCOME_TYPES, firstGoalSchema, incomeSchema, type IncomeType } from "@compass/shared";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { LANGUAGE_STORAGE_KEY, type Language } from "@/i18n";
import { useAuth } from "@/features/auth/auth-provider";
import { useUpdateProfile } from "@/features/profile/use-profile";

const TOTAL_STEPS = 3;

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "min-h-12 w-full rounded-lg border px-4 text-left",
        selected ? "border-primary bg-primary/10 font-medium" : "border-input",
      )}
    >
      {children}
    </button>
  );
}

export function OnboardingWizard() {
  const { t, i18n } = useTranslation();
  const { userId } = useAuth();
  const updateProfile = useUpdateProfile(userId);

  const [step, setStep] = useState(1);
  const [incomeType, setIncomeType] = useState<IncomeType | null>(null);
  const [income, setIncome] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [goalDate, setGoalDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const language: Language = i18n.language === "en" ? "en" : "bn";

  function chooseLanguage(lng: Language) {
    void i18n.changeLanguage(lng);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
    } catch {
      // ignore
    }
  }

  function nextFromIncome() {
    const parsed = incomeSchema.safeParse({
      income_type: incomeType,
      monthly_income: income === "" ? NaN : Number(income),
    });
    if (!parsed.success) return setError(t("onboarding.income_invalid"));
    setError(null);
    setStep(3);
  }

  async function finish(withGoal: boolean) {
    if (!userId || !incomeType) return;
    setError(null);

    let goal: ReturnType<typeof firstGoalSchema.parse> | null = null;
    if (withGoal) {
      const parsed = firstGoalSchema.safeParse({
        title: goalTitle,
        target_amount: Number(goalAmount),
        target_date: goalDate || null,
      });
      if (!parsed.success) return setError(t("onboarding.goal_invalid"));
      goal = parsed.data;
    }

    setBusy(true);
    try {
      if (goal) {
        const { error: goalErr } = await supabase.from("goals").insert({
          user_id: userId,
          title: goal.title,
          target_amount: goal.target_amount,
          target_date: goal.target_date ?? null,
        });
        if (goalErr) throw goalErr;
      }
      await updateProfile.mutateAsync({
        language,
        income_type: incomeType,
        monthly_income: Number(income),
        onboarded: true,
      });
      // The auth status flips to "ready" and the guard redirects home.
    } catch {
      setError(t("onboarding.failed"));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{t("onboarding.title")}</h1>
        <p className="text-muted-foreground text-sm">
          {t("onboarding.step", { current: step, total: TOTAL_STEPS })}
        </p>
      </div>

      {step === 1 && (
        <section className="space-y-3">
          <h2 className="font-medium">{t("onboarding.language_title")}</h2>
          <Choice selected={language === "bn"} onClick={() => chooseLanguage("bn")}>
            {t("language.bn")}
          </Choice>
          <Choice selected={language === "en"} onClick={() => chooseLanguage("en")}>
            {t("language.en")}
          </Choice>
          <Button className="w-full" onClick={() => setStep(2)}>
            {t("common.next")}
          </Button>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-3">
          <h2 className="font-medium">{t("onboarding.income_title")}</h2>
          <p className="text-muted-foreground text-sm">{t("onboarding.income_type")}</p>
          {INCOME_TYPES.map((type) => (
            <Choice key={type} selected={incomeType === type} onClick={() => setIncomeType(type)}>
              {t(`onboarding.${type}`)}
            </Choice>
          ))}
          <div className="space-y-2">
            <Label htmlFor="income">{t("onboarding.monthly_income")}</Label>
            <Input
              id="income"
              inputMode="numeric"
              value={income}
              onChange={(e) => setIncome(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              {t("common.back")}
            </Button>
            <Button className="flex-1" onClick={nextFromIncome}>
              {t("common.next")}
            </Button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-3">
          <h2 className="font-medium">{t("onboarding.goal_title")}</h2>
          <p className="text-muted-foreground text-sm">{t("onboarding.goal_optional")}</p>
          <div className="space-y-2">
            <Label htmlFor="goal-title">{t("onboarding.goal_name")}</Label>
            <Input
              id="goal-title"
              placeholder={t("onboarding.goal_name_hint")}
              value={goalTitle}
              onChange={(e) => setGoalTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="goal-amount">{t("onboarding.goal_amount")}</Label>
            <Input
              id="goal-amount"
              inputMode="numeric"
              value={goalAmount}
              onChange={(e) => setGoalAmount(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="goal-date">{t("onboarding.goal_date")}</Label>
            <Input
              id="goal-date"
              type="date"
              value={goalDate}
              onChange={(e) => setGoalDate(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setStep(2)}>
              {t("common.back")}
            </Button>
            <Button className="flex-1" disabled={busy} onClick={() => void finish(true)}>
              {busy ? t("common.saving") : t("common.finish")}
            </Button>
          </div>
          <Button
            variant="ghost"
            className="w-full"
            disabled={busy}
            onClick={() => void finish(false)}
          >
            {t("common.skip")}
          </Button>
        </section>
      )}
    </div>
  );
}
