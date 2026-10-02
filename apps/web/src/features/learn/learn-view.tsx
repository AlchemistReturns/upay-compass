"use client";

import Link from "next/link";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOnline } from "@/features/pwa/use-online";
import { PageHeader } from "@/components/page-header";
import { BadgeShelf } from "@/features/gamification/badge-shelf";
import { useGamification } from "@/features/gamification/use-gamification";
import { ProgressRing } from "./progress-ring";
import { useCompletedModules, useModules } from "./use-learn";

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

  return (
    <>
      <PageHeader title={t("learn.title")} />
      <div className="space-y-5 pb-4">
        <div className="flex items-center gap-3 rounded-xl border p-3">
          <ProgressRing
            done={done}
            total={total}
            label={t("learn.progress_label", { done, total })}
          />
          <div>
            <div className="font-medium">{t("learn.progress_title")}</div>
            <div className="text-muted-foreground text-sm">
              {days > 0 ? t("gamification.streak", { count: days }) : t("learn.progress_hint")}
            </div>
          </div>
        </div>

        {modules.isPending && (
          <p className="text-muted-foreground" role="status">
            {online ? t("common.loading") : t("pwa.offline_no_data")}
          </p>
        )}
        {modules.isError && <p>{t("common.error")}</p>}

        <ul className="space-y-2">
          {modules.data?.map((m) => {
            const finished = completed.data?.has(m.id) ?? false;
            return (
              <li key={m.id}>
                <Link
                  href={`/learn/${m.slug}`}
                  className="flex min-h-16 items-center gap-3 rounded-xl border p-3"
                >
                  <span
                    className={
                      finished
                        ? "bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-full"
                        : "bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                    }
                  >
                    {finished ? <CheckCircle2 className="size-5" aria-hidden /> : m.position}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{bn ? m.title_bn : m.title_en}</span>
                    <span className="text-muted-foreground block text-sm">
                      {bn ? m.summary_bn : m.summary_en}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {t("learn.minutes", { count: m.minutes })}
                      {finished ? ` · ${t("learn.done")}` : ""}
                    </span>
                  </span>
                  <ChevronRight className="text-muted-foreground size-5 shrink-0" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>

        <BadgeShelf />
        <p className="text-muted-foreground text-xs">{t("learn.disclaimer")}</p>
      </div>
    </>
  );
}
