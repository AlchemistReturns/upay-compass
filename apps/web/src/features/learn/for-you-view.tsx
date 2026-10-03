"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CircleCheck, Clock, Info, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LEARN_ROUTES, renderModuleMarkdown, type GeneratedModule } from "@compass/shared";
import { PageHeader } from "@/components/page-header";
import { LoadingCards } from "@/components/compass";
import { NAV_FORWARD } from "@/components/page-transition";
import { Button, buttonVariants } from "@/components/ui/button";
import { OfflineNote } from "@/features/pwa/offline-note";
import { useOnline } from "@/features/pwa/use-online";
import { haptic } from "@/lib/haptics";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { forYouHref } from "./for-you-section";
import { Markdown } from "./markdown";
import { useForYou, useUpdateForYou, type ForYouModule } from "./use-for-you";

/**
 * One "Made for you" lesson, read from the saved list by id (client-rendered, so no page per module
 * is built ahead of time). The same renderer and "finished" flow as the course, plus the reason it
 * was picked, the "Try this" button, a quick check, thumbs and "Not for me". Finishing it does not
 * count toward the 8 modules, the streak or any badge.
 */
export function ForYouView() {
  const { t } = useTranslation();
  const id = useSearchParams().get("id") ?? "";
  const online = useOnline();
  const { state, isPending, isError } = useForYou();
  const modules = state?.kind === "ready" ? state.modules : [];
  const index = modules.findIndex((m) => m.id === id);
  const m = index >= 0 ? modules[index] : undefined;

  return (
    <>
      <PageHeader
        back="/learn"
        eyebrow={t("learn.foryou.title")}
        title={m ? m.module.title : t("learn.title")}
      />
      {isPending &&
        (online ? (
          <LoadingCards rows={3} />
        ) : (
          <p className="text-muted-foreground" role="status">
            {t("pwa.offline_no_data")}
          </p>
        ))}
      {!isPending && (isError || !m) && (
        <div className="mx-auto max-w-2xl space-y-3">
          <p>{t("learn.foryou.not_found")}</p>
          <Link href="/learn" className={buttonVariants({ variant: "secondary" })}>
            {t("learn.foryou.back_hub")}
          </Link>
        </div>
      )}
      {m && <Lesson key={m.id} m={m} next={modules.slice(index + 1).find((x) => !x.completedAt)} />}
    </>
  );
}

function Lesson({ m, next }: { m: ForYouModule; next?: ForYouModule }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === "en" ? "en" : "bn";
  const online = useOnline();
  const router = useRouter();
  const update = useUpdateForYou();
  const finished = Boolean(m.completedAt);
  const route = m.module.try_this.route;

  const save = (u: Parameters<typeof update.mutate>[0], after?: () => void) =>
    update.mutate(u, { onSuccess: after });

  return (
    <article className="mx-auto max-w-2xl space-y-4 pb-4">
      <p className="callout items-start text-[13px] leading-5">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <span className="font-semibold">{t("learn.foryou.why")}</span>{" "}
          {t(`learn.foryou.reason.${m.reason}`)}
        </span>
      </p>
      <div className="text-muted-foreground flex items-center gap-1.5 px-1 text-[13px] font-semibold">
        <Clock className="size-3.5" aria-hidden />
        {t("learn.foryou.minutes", { n: formatNumber(m.minutes, i18n.language) })}
      </div>
      <div className="finance-card rise p-5 sm:p-8">
        <Markdown source={renderModuleMarkdown(m.module, language)} />
        <Link
          href={LEARN_ROUTES[route]}
          transitionTypes={NAV_FORWARD}
          className={cn(buttonVariants({ variant: "secondary" }), "mt-5 w-full sm:w-auto")}
        >
          {t("learn.foryou.try_open", { screen: t(`learn.foryou.route.${route}`) })}
          <ArrowRight className="ic-forward size-4" aria-hidden />
        </Link>
      </div>

      <QuickCheck m={m} />

      <div className="space-y-2.5">
        {finished ? (
          <p
            className="surface-lime pop flex items-center gap-3 rounded-3xl p-4 text-[15px] font-bold"
            role="status"
          >
            <span className="bg-brand-ink text-lime grid size-10 place-items-center rounded-full">
              <CircleCheck className="size-5" aria-hidden />
            </span>
            {t("learn.foryou.completed")}
          </p>
        ) : (
          <Button
            size="lg"
            className="w-full"
            loading={update.isPending && update.variables?.completed === true}
            disabled={!online}
            onClick={() => save({ id: m.id, completed: true }, () => haptic("success"))}
          >
            <CircleCheck aria-hidden />
            {t("learn.mark_done")}
          </Button>
        )}

        <div className="finance-card flex flex-wrap items-center gap-2 p-3">
          <span
            className="text-muted-foreground mr-auto px-1 text-sm font-medium"
            id={`fb-${m.id}`}
          >
            {t("learn.foryou.helpful")}
          </span>
          <div role="group" aria-labelledby={`fb-${m.id}`} className="flex gap-2">
            {([1, -1] as const).map((v) => {
              const pressed = m.feedback === v;
              const Icon = v === 1 ? ThumbsUp : ThumbsDown;
              return (
                <Button
                  key={v}
                  size="icon"
                  variant={pressed ? "default" : "secondary"}
                  aria-pressed={pressed}
                  aria-label={t(v === 1 ? "learn.foryou.thumbs_up" : "learn.foryou.thumbs_down")}
                  disabled={!online || update.isPending}
                  onClick={() => save({ id: m.id, feedback: pressed ? 0 : v })}
                >
                  <Icon className="size-[18px]" aria-hidden />
                </Button>
              );
            })}
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={!online || update.isPending}
            onClick={() => save({ id: m.id, dismissed: true }, () => router.push("/learn"))}
          >
            <X aria-hidden />
            {t("learn.foryou.not_for_me")}
          </Button>
        </div>
        <OfflineNote />
        {update.isError && (
          <p role="alert" className="text-destructive text-sm">
            {t("common.error")}
          </p>
        )}

        <Link
          href={next ? forYouHref(next.id) : "/learn"}
          transitionTypes={NAV_FORWARD}
          className="finance-card group flex items-center gap-3 p-4"
        >
          <span className="min-w-0 flex-1">
            <span className="text-muted-foreground block text-xs font-bold tracking-wide uppercase">
              {next ? t("learn.foryou.next") : t("learn.foryou.back_hub")}
            </span>
            <span className="mt-0.5 block truncate text-[15px] font-bold">
              {next ? next.module.title : t("learn.title")}
            </span>
          </span>
          <span className="bg-secondary text-primary grid size-10 shrink-0 place-items-center rounded-full">
            <ArrowRight className="ic-forward size-[18px]" aria-hidden />
          </span>
        </Link>
      </div>
      <p className="text-muted-foreground px-1 text-xs">{t("learn.foryou.separate")}</p>
      <p className="text-muted-foreground px-1 text-xs">{t("learn.disclaimer")}</p>
    </article>
  );
}

/**
 * Two or three questions. Picking an answer locks it and shows at once whether it was right, with
 * the one-line explanation. A wrong answer costs nothing; the first-try score is saved quietly
 * once every question is answered (not while offline).
 */
function QuickCheck({ m }: { m: ForYouModule }) {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  const update = useUpdateForYou();
  const questions: GeneratedModule["quick_check"] = m.module.quick_check;
  const [picked, setPicked] = useState<(number | null)[]>(() => questions.map(() => null));
  const answered = picked.filter((p) => p !== null).length;
  const score = picked.filter((p, i) => p === questions[i]!.answer).length;

  function choose(qi: number, oi: number) {
    if (picked[qi] !== null) return;
    const next = picked.map((p, i) => (i === qi ? oi : p));
    setPicked(next);
    haptic(oi === questions[qi]!.answer ? "success" : "light");
    if (next.every((p) => p !== null) && online && m.quickCheckScore === null) {
      update.mutate({
        id: m.id,
        quickCheckScore: next.filter((p, i) => p === questions[i]!.answer).length,
      });
    }
  }

  return (
    <section className="finance-card space-y-5 p-5 sm:p-6" aria-labelledby={`qc-${m.id}`}>
      <div>
        <h2 id={`qc-${m.id}`} className="text-lg font-extrabold tracking-tight">
          {t("learn.foryou.quick_title")}
        </h2>
        <p className="text-muted-foreground mt-0.5 text-[13px]">{t("learn.foryou.quick_hint")}</p>
      </div>
      {questions.map((q, qi) => {
        const choice = picked[qi];
        const locked = choice !== null;
        return (
          <fieldset key={qi} className="space-y-2">
            <legend className="mb-2 text-[15px] leading-snug font-bold">{q.question}</legend>
            {q.options.map((o, oi) => {
              const isAnswer = oi === q.answer;
              const isChoice = choice === oi;
              return (
                <button
                  key={oi}
                  type="button"
                  aria-pressed={isChoice}
                  aria-disabled={locked}
                  onClick={() => choose(qi, oi)}
                  className={cn(
                    "tap-soft flex min-h-11 w-full items-center gap-3 rounded-2xl border px-4 py-2.5 text-left text-sm font-medium",
                    !locked && "border-border hover:bg-secondary",
                    locked && isAnswer && "bg-positive-soft text-positive border-transparent",
                    locked &&
                      isChoice &&
                      !isAnswer &&
                      "bg-negative-soft text-destructive border-transparent",
                    locked && !isAnswer && !isChoice && "border-border text-muted-foreground",
                  )}
                >
                  <span className="flex-1">{o}</span>
                  {locked && isAnswer && <CircleCheck className="size-4 shrink-0" aria-hidden />}
                </button>
              );
            })}
            <p aria-live="polite" className="text-[13px] leading-5">
              {locked &&
                (choice === q.answer
                  ? `${t("learn.foryou.quick_right")} ${q.explanation}`
                  : `${t("learn.foryou.quick_not_quite", { answer: q.options[q.answer] })} ${q.explanation}`)}
            </p>
          </fieldset>
        );
      })}
      {answered === questions.length && (
        <p className="text-primary text-sm font-semibold" role="status">
          {t("learn.foryou.quick_score", {
            score: formatNumber(score, i18n.language),
            total: formatNumber(questions.length, i18n.language),
          })}
        </p>
      )}
    </section>
  );
}
