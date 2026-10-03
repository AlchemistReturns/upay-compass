"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, LogOut, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { INCOME_TYPES, incomeSchema, type IncomeType } from "@compass/shared";
import { PageHeader } from "@/components/page-header";
import { useSetLanguage } from "@/components/language-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/auth-provider";
import { OfflineNote } from "@/features/pwa/offline-note";
import { useOnline } from "@/features/pwa/use-online";
import { supabase } from "@/lib/supabase";
import { Avatar, formatPhone } from "./avatar";
import { useProfile, useUpdateProfile, type Profile } from "./use-profile";

const detailsSchema = incomeSchema.extend({
  full_name: z.string().trim().max(60),
});

/** Withdraw coach consent: the coach function refuses to answer until it is given again. */
function useStopCoachSharing() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ coach_consent_at: null })
        .eq("id", userId!);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile", userId] }),
  });
}

/** Seeded from the loaded profile once (the parent keys it by profile id). */
function DetailsForm({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const online = useOnline();
  const update = useUpdateProfile(profile.id);
  const [name, setName] = useState(profile.full_name ?? "");
  const [incomeType, setIncomeType] = useState<IncomeType | "">(profile.income_type ?? "");
  const [income, setIncome] = useState(
    profile.monthly_income === null ? "" : String(profile.monthly_income),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    const parsed = detailsSchema.safeParse({
      full_name: name,
      income_type: incomeType || undefined,
      monthly_income: income === "" ? NaN : Number(income),
    });
    if (!parsed.success) return setError(t("profile.invalid"));
    setError(null);
    try {
      await update.mutateAsync({
        full_name: parsed.data.full_name || null,
        income_type: parsed.data.income_type,
        monthly_income: parsed.data.monthly_income,
      });
      setSaved(true);
    } catch {
      setError(t("common.error"));
    }
  }

  return (
    <form onSubmit={submit} className="finance-card space-y-4 p-5 sm:p-6" noValidate>
      <h2 className="section-title">{t("profile.details_title")}</h2>
      <div className="space-y-2">
        <Label htmlFor="profile-name">{t("profile.name")}</Label>
        <Input
          id="profile-name"
          autoComplete="name"
          maxLength={60}
          placeholder={t("profile.no_name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="text-muted-foreground text-xs">{t("profile.name_hint")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="profile-income-type">{t("onboarding.income_type")}</Label>
          <NativeSelect
            id="profile-income-type"
            value={incomeType}
            onChange={(e) => setIncomeType(e.target.value as IncomeType)}
          >
            <option value="" disabled>
              -
            </option>
            {INCOME_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`onboarding.${type}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-income">{t("onboarding.monthly_income")}</Label>
          <Input
            id="profile-income"
            inputMode="numeric"
            value={income}
            onChange={(e) => setIncome(e.target.value.replace(/[^\d]/g, ""))}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={update.isPending || !online}>
          {update.isPending ? t("common.saving") : t("profile.save")}
        </Button>
        {saved && (
          <span
            role="status"
            className="text-positive flex items-center gap-1.5 text-sm font-medium"
          >
            <Check className="size-4" aria-hidden />
            {t("profile.saved")}
          </span>
        )}
      </div>
      <OfflineNote />
    </form>
  );
}

export function ProfileView() {
  const { t, i18n } = useTranslation();
  const { userId, signOut } = useAuth();
  const online = useOnline();
  const profile = useProfile(userId);
  const setLanguage = useSetLanguage();
  const stopSharing = useStopCoachSharing();
  const p = profile.data;
  const name = p?.full_name?.trim() || null;

  return (
    <>
      <PageHeader title={t("profile.title")} />

      {profile.isPending && <p className="text-muted-foreground">{t("common.loading")}</p>}
      {profile.isError && (
        <div>
          <p className="mb-2">{t("common.error")}</p>
          <Button onClick={() => void profile.refetch()}>{t("common.retry")}</Button>
        </div>
      )}

      {p && (
        <div className="mx-auto max-w-2xl space-y-4 pb-4">
          <section className="balance-panel flex items-center gap-4 p-5 sm:p-6">
            <Avatar name={name} className="relative z-[1] size-16 text-xl ring-white/30" />
            <div className="relative z-[1] min-w-0">
              <div className="truncate text-xl font-bold">
                {name ?? <span className="text-white/75">{t("profile.no_name")}</span>}
              </div>
              <div className="text-sm text-white/80 tabular-nums">{formatPhone(p.phone)}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.income_type && (
                  <span className="rounded-full bg-white/12 px-2.5 py-1 text-xs font-medium ring-1 ring-white/20">
                    {t(`onboarding.${p.income_type}`)}
                  </span>
                )}
                {p.role === "admin" && (
                  <span className="rounded-full bg-white/12 px-2.5 py-1 text-xs font-medium ring-1 ring-white/20">
                    {t("profile.admin_badge")}
                  </span>
                )}
              </div>
            </div>
          </section>

          <DetailsForm key={p.id} profile={p} />

          <section className="finance-card space-y-3 p-5 sm:p-6">
            <h2 className="section-title">{t("profile.phone")}</h2>
            <p className="font-semibold tabular-nums">{formatPhone(p.phone)}</p>
            <p className="text-muted-foreground text-xs">{t("profile.phone_locked")}</p>
          </section>

          <section className="finance-card space-y-3 p-5 sm:p-6" aria-labelledby="profile-lang">
            <h2 id="profile-lang" className="section-title">
              {t("language.label")}
            </h2>
            <div
              role="radiogroup"
              aria-labelledby="profile-lang"
              className="grid grid-cols-2 gap-2"
            >
              {(["bn", "en"] as const).map((lng) => {
                const active = i18n.language === lng;
                return (
                  <button
                    key={lng}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    lang={lng}
                    onClick={() => setLanguage(lng)}
                    className={cn(
                      "flex min-h-12 items-center justify-between rounded-xl border px-4 text-sm transition-colors",
                      active
                        ? "border-primary bg-secondary font-semibold"
                        : "bg-card hover:bg-muted/60",
                    )}
                  >
                    {t(`language.${lng}`)}
                    {active && <Check className="text-primary size-4" aria-hidden />}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="finance-card space-y-3 p-5 sm:p-6">
            <h2 className="section-title flex items-center gap-2">
              <ShieldCheck className="text-primary size-[18px]" aria-hidden />
              {t("profile.coach_title")}
            </h2>
            <p className="text-muted-foreground text-sm leading-6">
              {p.coach_consent_at
                ? t("profile.coach_on", {
                    date: formatShortDate(p.coach_consent_at, i18n.language),
                  })
                : t("profile.coach_off")}
            </p>
            {p.coach_consent_at && (
              <Button
                variant="outline"
                disabled={stopSharing.isPending || !online}
                onClick={() =>
                  window.confirm(t("profile.coach_stop_confirm")) && stopSharing.mutate()
                }
              >
                {t("profile.coach_stop")}
              </Button>
            )}
            {stopSharing.isError && (
              <p role="alert" className="text-destructive text-sm">
                {t("common.error")}
              </p>
            )}
          </section>

          <Button
            variant="destructive"
            className="h-12 w-full gap-2"
            onClick={() => void signOut()}
          >
            <LogOut className="size-4" aria-hidden />
            {t("common.logout")}
          </Button>
          <p className="text-muted-foreground text-center text-xs">{t("common.simulated_note")}</p>
        </div>
      )}
    </>
  );
}
