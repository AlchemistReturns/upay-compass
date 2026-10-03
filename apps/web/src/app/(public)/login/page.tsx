"use client";

import { useTranslation } from "react-i18next";
import { Check, ShieldCheck, Sparkles } from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";
import { LoginForm } from "@/features/auth/login-form";

export default function LoginPage() {
  const { t } = useTranslation();
  return (
    <section className="bg-card grid overflow-hidden rounded-[1.75rem] border shadow-[0_24px_80px_rgba(15,61,115,.12)] md:min-h-[min(720px,calc(100dvh-4rem))] md:grid-cols-[1.05fr_.95fr]">
      {/* Brand panel: compact on phones so the form is above the fold, full story from md up */}
      <div className="auth-showcase flex flex-col justify-between gap-6 p-6 text-white sm:p-10 lg:p-12">
        <div className="relative z-[1] flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-white/15 text-lg font-bold ring-1 ring-white/25">
            u
          </span>
          <span className="text-lg font-semibold tracking-tight">
            upay <span className="font-normal text-white/75">Compass</span>
          </span>
        </div>

        <div className="relative z-[1] max-w-lg md:my-10">
          <div className="mb-5 hidden items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium md:inline-flex">
            <Sparkles className="size-4" aria-hidden /> {t("login.hero_tag")}
          </div>
          <h1 className="text-2xl leading-tight font-semibold tracking-tight sm:text-4xl lg:text-5xl lg:leading-[1.1]">
            {t("login.hero_title")}
          </h1>
          <p className="mt-4 hidden max-w-md text-base leading-7 text-white/80 md:block">
            {t("login.hero_body")}
          </p>
          <ul className="mt-8 hidden space-y-3 md:block">
            {[t("login.benefit_spend"), t("login.benefit_goals"), t("login.benefit_coach")].map(
              (item) => (
                <li key={item} className="flex items-center gap-3 text-sm text-white/90">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/15">
                    <Check className="size-3.5" aria-hidden />
                  </span>
                  {item}
                </li>
              ),
            )}
          </ul>
        </div>

        <div className="relative z-[1] hidden items-center gap-2 text-xs text-white/80 md:flex">
          <ShieldCheck className="size-4 shrink-0" aria-hidden /> {t("login.privacy_line")}
        </div>

        {/* decorative preview card, wide screens only; the figure is illustrative */}
        <div
          aria-hidden
          className="pointer-events-none absolute right-10 bottom-24 hidden w-56 rotate-[-6deg] rounded-2xl border border-white/20 bg-white/10 p-5 shadow-2xl backdrop-blur-sm xl:block"
        >
          <div className="text-xs text-white/75">{t("login.preview_label")}</div>
          <div className="mt-2 text-3xl font-semibold">৳ 8,450</div>
          <div className="mt-5 flex h-12 items-end gap-2">
            {[36, 58, 45, 76, 55, 90, 70].map((h, i) => (
              <i key={i} className="flex-1 rounded-t bg-white/70" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>

      <div className="relative flex items-center justify-center p-6 pt-5 sm:p-12 lg:p-16">
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
          <LanguageToggle />
        </div>
        <div className="w-full max-w-sm pt-10 md:pt-0">
          <div className="text-primary mb-2 text-sm font-semibold">{t("login.welcome")}</div>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("login.title")}</h2>
          <p className="text-muted-foreground mt-1 mb-6 text-sm leading-6 sm:mb-8">
            {t("login.demo_note")}
          </p>
          <LoginForm />
          <p className="text-muted-foreground mt-6 flex items-start justify-center gap-1.5 text-center text-xs leading-5 sm:mt-8">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 md:hidden" aria-hidden />
            {t("login.continue_note")}
          </p>
        </div>
      </div>
    </section>
  );
}
