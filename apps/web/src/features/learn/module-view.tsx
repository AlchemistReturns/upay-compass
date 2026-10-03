"use client";

import Link from "next/link";
import { ArrowRight, CircleCheck, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";
import { LoadingCards } from "@/components/compass";
import { Button } from "@/components/ui/button";
import { haptic } from "@/lib/haptics";
import { useOnline } from "@/features/pwa/use-online";
import { Markdown } from "./markdown";
import { useCompleteModule, useCompletedModules, useModules } from "./use-learn";
import { NAV_FORWARD } from "@/components/page-transition";

export function ModuleView({ slug }: { slug: string }) {
  const { t, i18n } = useTranslation();
  const bn = i18n.language === "bn";
  const online = useOnline();
  const all = useModules();
  const completed = useCompletedModules();
  const complete = useCompleteModule();

  const m = all.data?.find((x) => x.slug === slug);
  const finished = m ? (completed.data?.has(m.id) ?? false) : false;
  const next = m ? all.data?.find((x) => x.position > m.position) : undefined;
  const total = all.data?.length ?? 0;

  return (
    <>
      <PageHeader
        back="/learn"
        eyebrow={m ? `${t("learn.title")} · ${m.position}/${total}` : undefined}
        title={m ? (bn ? m.title_bn : m.title_en) : t("learn.title")}
      />

      {all.isPending &&
        (online ? (
          <LoadingCards rows={3} />
        ) : (
          <p className="text-muted-foreground" role="status">
            {t("pwa.offline_no_data")}
          </p>
        ))}
      {all.isError && <p>{t("common.error")}</p>}
      {all.isSuccess && !m && <p>{t("learn.not_found")}</p>}

      {m && (
        <article className="mx-auto max-w-2xl space-y-4 pb-4">
          <div className="text-muted-foreground -mt-2 flex items-center gap-1.5 px-1 text-[13px] font-semibold">
            <Clock className="size-3.5" aria-hidden />
            {t("learn.minutes", { count: m.minutes })}
          </div>
          <div className="finance-card rise p-5 sm:p-8">
            <Markdown source={bn ? m.body_md_bn : m.body_md_en} />
          </div>

          <div className="space-y-2.5">
            {finished ? (
              <p
                className="surface-lime pop flex items-center gap-3 rounded-3xl p-4 text-[15px] font-bold"
                role="status"
              >
                <span className="bg-brand-ink text-lime grid size-10 place-items-center rounded-full">
                  <CircleCheck className="size-5" aria-hidden />
                </span>
                {t("learn.completed")}
              </p>
            ) : (
              <Button
                size="lg"
                className="w-full"
                loading={complete.isPending}
                disabled={!online}
                onClick={() => complete.mutate(m.slug, { onSuccess: () => haptic("success") })}
              >
                <CircleCheck aria-hidden />
                {t("learn.mark_done")}
              </Button>
            )}
            {!finished && !online && (
              <p className="text-muted-foreground text-sm">{t("pwa.offline_write")}</p>
            )}
            {complete.isError && <p className="text-destructive text-sm">{t("common.error")}</p>}
            {next && (
              <Link
                href={`/learn/${next.slug}`}
                transitionTypes={NAV_FORWARD}
                className="finance-card group flex items-center gap-3 p-4"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-muted-foreground block text-xs font-bold tracking-wide uppercase">
                    {t("learn.next")}
                  </span>
                  <span className="mt-0.5 block truncate text-[15px] font-bold">
                    {bn ? next.title_bn : next.title_en}
                  </span>
                </span>
                <span className="bg-secondary text-primary grid size-10 shrink-0 place-items-center rounded-full transition-transform group-hover:translate-x-0.5">
                  <ArrowRight className="size-[18px]" aria-hidden />
                </span>
              </Link>
            )}
          </div>
          <p className="text-muted-foreground px-1 text-xs">{t("learn.disclaimer")}</p>
        </article>
      )}
    </>
  );
}
