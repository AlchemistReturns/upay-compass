"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  ChevronRight,
  Languages,
  LogOut,
  Phone,
  ShieldCheck,
  SunMoon,
  Upload,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { INCOME_TYPES, incomeSchema, type IncomeType } from "@compass/shared";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingCards, Pill } from "@/components/compass";
import { useSetLanguage } from "@/components/language-toggle";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/segmented";
import { ThemeSwitch } from "@/components/theme-switch";
import { toast } from "@/components/toaster";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useAuth } from "@/features/auth/auth-provider";
import { OfflineNote } from "@/features/pwa/offline-note";
import { useOnline } from "@/features/pwa/use-online";
import { PasskeyCard } from "@/features/auth/passkey-card";
import { NAV_FORWARD } from "@/components/page-transition";
import { AiActivityCard } from "./ai-activity-card";
import { PrivacyCard } from "./privacy-card";
import { Avatar, formatPhone } from "./avatar";
import { useProfile, useUpdateProfile, type Profile } from "./use-profile";

/** One row that opens another screen. */
function LinkRow({
  href,
  icon: Icon,
  label,
  hint,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  hint?: string;
}) {
  return (
    <Link
      href={href}
      transitionTypes={NAV_FORWARD}
      className="tap-soft hover:bg-secondary/60 -mx-2 flex min-h-12 items-center gap-3 rounded-2xl px-2"
    >
      <span className="icon-chip">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{label}</span>
        {hint && <span className="text-muted-foreground block text-xs leading-4">{hint}</span>}
      </span>
      <ChevronRight className="ic-forward text-muted-foreground size-4 shrink-0" aria-hidden />
    </Link>
  );
}

/** Things that used to hide in the header menu or the sidebar: importing data, system health, admin tools. */
function MoreLinks({ admin }: { admin: boolean }) {
  const { t } = useTranslation();
  return (
    <section className="finance-card space-y-1 p-5 sm:p-6" aria-labelledby="profile-more">
      <h2 id="profile-more" className="mb-1 text-[17px] font-bold">
        {t("profile.more")}
      </h2>
      <LinkRow
        href="/transactions/import"
        icon={Upload}
        label={t("import.title")}
        hint={t("profile.import_hint")}
      />
      <LinkRow href="/system-health" icon={Activity} label={t("monitor.open")} />
      {admin && <LinkRow href="/admin" icon={ShieldCheck} label={t("admin.open")} />}
    </section>
  );
}

const detailsSchema = incomeSchema.extend({
  full_name: z.string().trim().max(60),
});

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
      toast.success(t("profile.saved"));
    } catch {
      setError(t("common.error"));
    }
  }

  return (
    <form
      onSubmit={submit}
      className="finance-card rise space-y-4 p-5 sm:p-6"
      style={{ "--i": 1 } as React.CSSProperties}
      noValidate
    >
      <h2 className="text-[17px] font-bold">{t("profile.details_title")}</h2>
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
        <p className="text-muted-foreground px-1 text-xs">{t("profile.name_hint")}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <Button type="submit" loading={update.isPending} disabled={!online}>
          {t("profile.save")}
        </Button>
      </div>
      <OfflineNote />
    </form>
  );
}

export function ProfileView() {
  const { t, i18n } = useTranslation();
  const { userId, signOut } = useAuth();
  const profile = useProfile(userId);
  const setLanguage = useSetLanguage();
  const p = profile.data;
  const name = p?.full_name?.trim() || null;

  return (
    <>
      <PageHeader title={t("profile.title")} back="/" />

      {profile.isPending && <LoadingCards hero rows={2} />}
      {profile.isError && <ErrorState onRetry={() => void profile.refetch()} />}

      {p && (
        <div className="mx-auto max-w-2xl space-y-4 pb-4">
          <section className="balance-panel rise flex items-center gap-4 p-5 sm:p-6">
            <Avatar
              name={name}
              className="bg-lime text-brand-ink size-[4.5rem] bg-none text-2xl ring-4 ring-white/15"
            />
            <div className="min-w-0">
              <div className="truncate text-xl font-extrabold tracking-tight">
                {name ?? <span className="text-on-dark-muted">{t("profile.no_name")}</span>}
              </div>
              <div className="text-on-dark-muted num text-sm">{formatPhone(p.phone)}</div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {p.income_type && <Pill tone="dark">{t(`onboarding.${p.income_type}`)}</Pill>}
                {p.role === "admin" && <Pill tone="lime">{t("profile.admin_badge")}</Pill>}
              </div>
            </div>
          </section>

          <DetailsForm key={p.id} profile={p} />

          <section className="finance-card flex items-center gap-3.5 p-5 sm:p-6">
            <span className="icon-chip">
              <Phone className="size-[18px]" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-muted-foreground text-[13px] font-semibold">
                {t("profile.phone")}
              </h2>
              <p className="num text-[15px] font-bold">{formatPhone(p.phone)}</p>
              <p className="text-muted-foreground mt-0.5 text-xs leading-4">
                {t("profile.phone_locked")}
              </p>
            </div>
          </section>

          <section className="finance-card space-y-3 p-5 sm:p-6" aria-labelledby="profile-lang">
            <h2 id="profile-lang" className="flex items-center gap-2 text-[17px] font-bold">
              <Languages className="text-primary size-[18px]" aria-hidden />
              {t("language.label")}
            </h2>
            <Segmented
              label={t("language.label")}
              value={i18n.language === "en" ? "en" : "bn"}
              onSelect={(lng) => setLanguage(lng)}
              options={(["bn", "en"] as const).map((lng) => ({
                value: lng,
                label: t(`language.${lng}`),
                lang: lng,
              }))}
            />
          </section>

          <section className="finance-card space-y-3 p-5 sm:p-6" aria-labelledby="profile-theme">
            <h2 id="profile-theme" className="flex items-center gap-2 text-[17px] font-bold">
              <SunMoon className="text-primary size-[18px]" aria-hidden />
              {t("appearance.title")}
            </h2>
            <ThemeSwitch />
          </section>

          <PasskeyCard />

          <MoreLinks admin={p.role === "admin"} />

          <AiActivityCard profile={p} />

          <PrivacyCard />

          <Button variant="destructive" className="w-full" onClick={() => void signOut()}>
            <LogOut className="ic-forward size-4" aria-hidden />
            {t("common.logout")}
          </Button>
        </div>
      )}
    </>
  );
}
