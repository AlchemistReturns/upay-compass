"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Languages, Target, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { INCOME_TYPES, firstGoalSchema, incomeSchema, type IncomeType } from "@compass/shared";
import { supabase } from "@/lib/supabase";
import { BrandMark } from "@/components/compass";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { LANGUAGE_STORAGE_KEY, type Language } from "@/i18n";
import { useAuth } from "@/features/auth/auth-provider";
import { PERSONA_ICON } from "@/features/transactions/demo-loader";
import { useUpdateProfile } from "@/features/profile/use-profile";

const TOTAL_STEPS = 3;
const STEP_ICON = { 1: Languages, 2: Wallet, 3: Target } as const;

function Choice({
  selected,
  onClick,
  icon,
  lang,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  lang?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!selected) haptic("light");
        onClick();
      }}
      aria-pressed={selected}
      lang={lang}
      className={cn(
        "flex min-h-[3.75rem] w-full items-center gap-3.5 rounded-2xl border px-4 text-left text-[15px] tap-soft",
        selected
          ? "border-primary bg-secondary font-bold shadow-[0_0_0_3px_rgba(255, 194, 14,.7)]"
          : "bg-card hover:border-primary/30 border-hairline-strong font-semibold",
      )}
    >
      {icon && (
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl transition-colors",
            selected ? "bg-brand-deep text-lime" : "bg-secondary text-primary",
          )}
        >
          {icon}
        </span>
      )}
      <span className="flex-1">{children}</span>
      <span
        aria-hidden
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
          selected
            ? "border-brand-deep bg-brand-deep text-lime dark:border-lime/40"
            : "border-input",
        )}
      >
        {selected && <Check className="ic-draw size-3.5" strokeWidth={3} />}
      </span>
    </button>
  );
}

export function OnboardingWizard() {
  const { t, i18n } = useTranslation();
  const { userId } = useAuth();
  const updateProfile = useUpdateProfile(userId);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [incomeType, setIncomeType] = useState<IncomeType | null>(null);
  const [income, setIncome] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [goalDate, setGoalDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const language: Language = i18n.language === "en" ? "en" : "bn";
  const StepIcon = STEP_ICON[step];
  const stepTitle = {
    1: t("onboarding.language_title"),
    2: t("onboarding.income_title"),
    3: t("onboarding.goal_title"),
  }[step];

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
    <div className="finance-card rise overflow-hidden">
      <div className="balance-panel rounded-none p-6 shadow-none sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <BrandMark className="size-10" />
          <div className="flex gap-1.5" aria-hidden>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
                  i + 1 === step
                    ? "bg-lime w-8"
                    : i + 1 < step
                      ? "bg-lime/60 w-3"
                      : "w-3 bg-white/20",
                )}
              />
            ))}
          </div>
        </div>
        <div key={step} className="rise mt-7">
          <span className="bg-lime text-brand-ink mb-4 grid size-12 place-items-center rounded-2xl">
            <StepIcon className="size-6" aria-hidden />
          </span>
          <p className="text-lime text-xs font-bold tracking-wide uppercase">
            {t("onboarding.step", { current: step, total: TOTAL_STEPS })}
          </p>
          <h1 className="mt-1 text-[1.625rem] leading-tight font-extrabold tracking-tight">
            {stepTitle}
          </h1>
          <p className="text-on-dark-muted mt-1 text-sm">{t("onboarding.title")}</p>
        </div>
      </div>

      <div key={step} className="fade-in p-5 sm:p-7">
        {step === 1 && (
          <section className="space-y-2.5">
            <Choice
              selected={language === "bn"}
              onClick={() => chooseLanguage("bn")}
              lang="bn"
              icon={<span className="text-base font-bold">অ</span>}
            >
              {t("language.bn")}
            </Choice>
            <Choice
              selected={language === "en"}
              onClick={() => chooseLanguage("en")}
              lang="en"
              icon={<span className="text-base font-bold">A</span>}
            >
              {t("language.en")}
            </Choice>
            <Button size="lg" className="mt-3 w-full" onClick={() => setStep(2)}>
              {t("common.next")}
              <ArrowRight aria-hidden />
            </Button>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-2.5">
            <p className="text-foreground/85 px-1 pb-0.5 text-[13px] font-semibold">
              {t("onboarding.income_type")}
            </p>
            {INCOME_TYPES.map((type) => {
              const Icon = PERSONA_ICON[type];
              return (
                <Choice
                  key={type}
                  selected={incomeType === type}
                  onClick={() => setIncomeType(type)}
                  icon={<Icon className="size-5" aria-hidden />}
                >
                  {t(`onboarding.${type}`)}
                </Choice>
              );
            })}
            <div className="space-y-2 pt-3">
              <Label htmlFor="income">{t("onboarding.monthly_income")}</Label>
              <MoneyInput id="income" value={income} onChange={setIncome} />
            </div>
            {error && (
              <p role="alert" className="text-destructive px-1 text-sm font-medium">
                {error}
              </p>
            )}
            <div className="flex gap-2 pt-3">
              <Button
                variant="secondary"
                size="lg"
                aria-label={t("common.back")}
                onClick={() => setStep(1)}
              >
                <ArrowLeft aria-hidden />
              </Button>
              <Button size="lg" className="flex-1" onClick={nextFromIncome}>
                {t("common.next")}
                <ArrowRight aria-hidden />
              </Button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-4">
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
              <MoneyInput id="goal-amount" value={goalAmount} onChange={setGoalAmount} />
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
              <p role="alert" className="text-destructive px-1 text-sm font-medium">
                {error}
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <Button
                variant="secondary"
                size="lg"
                aria-label={t("common.back")}
                disabled={busy}
                onClick={() => setStep(2)}
              >
                <ArrowLeft aria-hidden />
              </Button>
              <Button
                size="lg"
                className="flex-1"
                disabled={busy}
                onClick={() => void finish(true)}
              >
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
    </div>
  );
}
