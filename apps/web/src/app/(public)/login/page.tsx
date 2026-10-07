"use client";

import { useTranslation } from "react-i18next";
import { Check, ShieldCheck, Sparkles } from "lucide-react";
import { BrandMark } from "@/components/compass";
import { LanguageToggle } from "@/components/language-toggle";
import { LoginForm } from "@/features/auth/login-form";

/** Decorative preview of the app on wide screens; the figures are illustrative. */
function PreviewCard() {
  const { t } = useTranslation();
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute right-10 bottom-24 hidden w-60 rotate-[-5deg] rounded-3xl border border-white/15 bg-white/8 p-5 shadow-2xl backdrop-blur-md xl:block"
    >
      <div className="text-on-dark-muted text-xs font-semibold">{t("login.preview_label")}</div>
      <div className="mt-1.5 text-3xl font-extrabold tracking-tight">৳ 8,450</div>
      <div className="mt-5 flex h-14 items-end gap-1.5">
        {[36, 58, 45, 76, 55, 90, 70].map((h, i) => (
          <i
            key={i}
            className={i === 5 ? "bg-lime flex-1 rounded-full" : "flex-1 rounded-full bg-white/25"}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { t } = useTranslation();
  const benefits = [t("login.benefit_spend"), t("login.benefit_goals"), t("login.benefit_coach")];

  return (
    <section className="grid min-h-dvh grid-rows-[auto_1fr] overflow-hidden md:grid-rows-1 sm:min-h-0 sm:rounded-[2.25rem] sm:shadow-[0_40px_100px_-40px_rgba(6,47,49,.45)] md:min-h-[min(740px,calc(100dvh-4rem))] md:grid-cols-[1.05fr_.95fr]">
      {/* Brand panel: a compact header on phones, the full story from md up */}
      <div className="auth-showcase relative flex flex-col justify-between gap-6 px-6 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-14 sm:p-10 md:pb-10 lg:p-12">
        <div className="flex items-center justify-between gap-3">
          <div className="brand-intro flex items-center gap-3">
            <BrandMark className="size-11 shadow-[0_8px_20px_-8px_rgba(0,0,0,.5)]" />
            <span className="text-lg font-bold tracking-tight">
              upay <span className="text-on-dark-muted font-medium">Compass</span>
            </span>
          </div>
          <LanguageToggle className="text-on-dark tap size-11 rounded-full border border-white/15 bg-white/10 backdrop-blur-md hover:bg-white/18 md:hidden" />
        </div>

        <div className="rise max-w-lg md:my-10">
          <div className="text-lime mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-xs font-semibold">
            <Sparkles className="ic-spin-in size-3.5 [animation-delay:.5s]" aria-hidden />{" "}
            {t("login.hero_tag")}
          </div>
          <h1 className="text-[1.875rem] leading-[1.12] font-extrabold tracking-[-0.03em] text-balance sm:text-4xl lg:text-[3.25rem] lg:leading-[1.05]">
            {t("login.hero_title")}
          </h1>
          <p className="text-on-dark-muted mt-4 hidden max-w-md text-base leading-7 md:block">
            {t("login.hero_body")}
          </p>
          <ul className="mt-8 hidden space-y-3 md:block">
            {benefits.map((item, i) => (
              <li
                key={item}
                className="rise flex items-center gap-3 text-sm font-medium"
                style={{ "--i": i + 2 } as React.CSSProperties}
              >
                <span className="bg-lime text-brand-ink grid size-6 shrink-0 place-items-center rounded-full">
                  <Check className="ic-draw size-3.5" strokeWidth={3} aria-hidden />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="text-on-dark-muted hidden items-center gap-2 text-xs md:flex">
          <ShieldCheck className="size-4 shrink-0" aria-hidden /> {t("login.privacy_line")}
        </div>

        <PreviewCard />
      </div>

      {/* Form: a sheet rising over the brand panel on phones, its own column from md up */}
      <div className="bg-card relative z-[1] -mt-8 flex items-start justify-center rounded-t-[2rem] px-6 pt-8 pb-[calc(env(safe-area-inset-bottom)+2rem)] shadow-[0_-20px_40px_-24px_rgba(6,47,49,.5)] sm:p-12 md:mt-0 md:items-center md:rounded-none md:shadow-none lg:p-16">
        <div className="absolute top-6 right-6 hidden md:block">
          <LanguageToggle />
        </div>
        <div className="rise w-full max-w-sm" style={{ "--i": 1 } as React.CSSProperties}>
          <div className="text-primary mb-1.5 text-sm font-bold">{t("login.welcome")}</div>
          <h2 className="text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-3xl">
            {t("login.title")}
          </h2>
          <div className="mt-7">
            <LoginForm />
          </div>
        </div>
      </div>
    </section>
  );
}
