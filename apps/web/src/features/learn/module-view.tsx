"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOnline } from "@/features/pwa/use-online";
import { Markdown } from "./markdown";
import { useCompleteModule, useCompletedModules, useModules } from "./use-learn";

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

  return (
    <>
      <PageHeader title={t("learn.title")} />
      <Link
        href="/learn"
        className="text-muted-foreground mb-3 inline-flex min-h-11 items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("learn.back")}
      </Link>

      {all.isPending && (
        <p className="text-muted-foreground" role="status">
          {online ? t("common.loading") : t("pwa.offline_no_data")}
        </p>
      )}
      {all.isError && <p>{t("common.error")}</p>}
      {all.isSuccess && !m && <p>{t("learn.not_found")}</p>}

      {m && (
        <article className="space-y-4 pb-4">
          <div>
            <h2 className="text-xl font-semibold">{bn ? m.title_bn : m.title_en}</h2>
            <p className="text-muted-foreground text-sm">
              {t("learn.minutes", { count: m.minutes })}
            </p>
          </div>
          <Markdown source={bn ? m.body_md_bn : m.body_md_en} />

          <div className="space-y-2 border-t pt-4">
            {finished ? (
              <p className="text-primary flex items-center gap-2 font-medium" role="status">
                <CheckCircle2 className="size-5" aria-hidden />
                {t("learn.completed")}
              </p>
            ) : (
              <Button
                className="min-h-11 w-full"
                disabled={complete.isPending || !online}
                onClick={() => complete.mutate(m.slug)}
              >
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
                className={cn(buttonVariants({ variant: "outline" }), "min-h-11 w-full")}
              >
                {t("learn.next")}
              </Link>
            )}
          </div>
          <p className="text-muted-foreground text-xs">{t("learn.disclaimer")}</p>
        </article>
      )}
    </>
  );
}
