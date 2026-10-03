"use client";

import Link from "next/link";
import { ArrowRight, CircleCheck, ChevronRight, Clock, Flame } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOnline } from "@/features/pwa/use-online";
import { PageHeader } from "@/components/page-header";
import { LoadingCards, Pill, Ring, SectionHeader } from "@/components/compass";
import { BadgeShelf } from "@/features/gamification/badge-shelf";
import { useGamification } from "@/features/gamification/use-gamification";
import { cn } from "@/lib/utils";
import { useCompletedModules, useModules } from "./use-learn";
import { NAV_FORWARD } from "@/components/page-transition";

export function LearnView() {
  const { t, i18n } = useTranslation();
  const bn = i18n.language === "bn";
  const online = useOnline();
  const modules = useModules();
  const completed = useCompletedModules();
  const streak = useGamification();
  const total = modules.data?.length ?? 0;
  const done = modules.data?.filter((m) => completed.data?.has(m.id)).length ?? 0;
  const days = streak.data?.streak_days ?? 0;
  const next = modules.data?.find((m) => !completed.data?.has(m.id));
  const pct = total > 0 ? (done / total) * 100 : 0;

  return (
    <>
      <PageHeader title={t("learn.title")} subtitle={t("learn.disclaimer")} />
      <div className="space-y-7 pb-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <section className="balance-panel rise flex items-center gap-5 p-5 sm:p-6">
            <Ring value={pct} size={92} stroke={9} track="rgba(255,255,255,.1)" color="var(--lime)">
              <span
                role="img"
                aria-label={t("learn.progress_label", { done, total })}
                className="num text-xl font-extrabold"
              >
                {done}/{total}
              </span>
            </Ring>
            <div className="min-w-0">
              <div className="text-lg font-extrabold tracking-tight">
                {t("learn.progress_title")}
              </div>
              <div className="text-on-dark-muted mt-0.5 text-sm">
                {t("learn.progress_label", { done, total })}
              </div>
              {days > 0 ? (
                <Pill tone="reward" className="mt-3">
                  <Flame fill="currentColor" aria-hidden />
                  {t("gamification.streak", { count: days })}
                </Pill>
              ) : (
                <p className="text-on-dark-muted mt-2 text-[13px]">{t("learn.progress_hint")}</p>
              )}
            </div>
          </section>

          {next && (
            <Link
              href={`/learn/${next.slug}`}
              transitionTypes={NAV_FORWARD}
              className="surface-lime group rise flex flex-col justify-between gap-4 rounded-[2rem] p-5 shadow-[0_16px_34px_-20px_rgba(79,158,58,.9)] tap-soft sm:p-6"
              style={{ "--i": 1 } as React.CSSProperties}
            >
              <div>
                <p className="text-brand-ink/70 text-xs font-bold tracking-wide uppercase">
                  {t("learn.up_next")}
                </p>
                <p className="mt-1.5 text-lg leading-snug font-extrabold">
                  {bn ? next.title_bn : next.title_en}
                </p>
                <p className="text-brand-ink/75 mt-1 line-clamp-2 text-sm">
                  {bn ? next.summary_bn : next.summary_en}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-brand-ink/75 flex items-center gap-1.5 text-xs font-semibold">
                  <Clock className="size-3.5" aria-hidden />
                  {t("learn.minutes", { count: next.minutes })}
                </span>
                <span className="bg-brand-ink text-lime flex h-10 items-center gap-1.5 rounded-full pr-3 pl-4 text-[13px] font-bold">
                  {t("learn.start")}
                  <ArrowRight className="ic-forward size-4" aria-hidden />
                </span>
              </div>
            </Link>
          )}
        </div>

        {modules.isPending && (
          <div>
            <p className="sr-only" role="status">
              {online ? t("common.loading") : t("pwa.offline_no_data")}
            </p>
            {online ? (
              <LoadingCards rows={4} />
            ) : (
              <p className="text-muted-foreground">{t("pwa.offline_no_data")}</p>
            )}
          </div>
        )}
        {modules.isError && <p>{t("common.error")}</p>}

        {modules.data && modules.data.length > 0 && (
          <section aria-labelledby="modules-heading">
            <SectionHeader
              id="modules-heading"
              title={t("learn.progress_title")}
              className="sr-only"
            />
            <ul className="grid gap-2.5 lg:grid-cols-2">
              {modules.data.map((m, i) => {
                const finished = completed.data?.has(m.id) ?? false;
                return (
                  <li
                    key={m.id}
                    className="rise"
                    style={{ "--i": Math.min(i + 2, 8) } as React.CSSProperties}
                  >
                    <Link
                      href={`/learn/${m.slug}`}
                      transitionTypes={NAV_FORWARD}
                      className="finance-card flex h-full min-h-20 items-center gap-3.5 p-4"
                    >
                      <span
                        className={cn(
                          "num grid size-12 shrink-0 place-items-center rounded-2xl text-base font-extrabold",
                          finished ? "bg-positive-soft text-positive" : "bg-secondary text-primary",
                        )}
                      >
                        {finished ? <CircleCheck className="size-6" aria-hidden /> : m.position}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] leading-snug font-bold">
                          {bn ? m.title_bn : m.title_en}
                        </span>
                        <span className="text-muted-foreground mt-0.5 line-clamp-2 block text-[13px] leading-5">
                          {bn ? m.summary_bn : m.summary_en}
                        </span>
                        <span className="text-muted-foreground mt-1.5 flex items-center gap-1.5 text-xs font-medium">
                          <Clock className="size-3" aria-hidden />
                          {t("learn.minutes", { count: m.minutes })}
                          {finished && (
                            <span className="text-positive font-semibold">· {t("learn.done")}</span>
                          )}
                        </span>
                      </span>
                      <ChevronRight
                        className="text-muted-foreground/60 size-5 shrink-0"
                        aria-hidden
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <BadgeShelf />
      </div>
    </>
  );
}
