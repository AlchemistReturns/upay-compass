"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, CircleCheck, Clock, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Pill, SectionHeader } from "@/components/compass";
import { NAV_FORWARD } from "@/components/page-transition";
import { Skeleton } from "@/components/skeleton";
import { Button } from "@/components/ui/button";
import { ConsentCard } from "@/features/coach/consent-card";
import { useOnline } from "@/features/pwa/use-online";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useForYou, type ForYouModule } from "./use-for-you";

/** Link to a personalized module. Static route + id, so no page per module has to be built. */
export const forYouHref = (id: string) => `/learn/for-you?id=${encodeURIComponent(id)}`;

/**
 * "Made for you": up to three lessons written for this person, between "Up next" and the course.
 * Same card as the course rows. Loading shows card-shaped placeholders; without the coach consent a
 * single calm card explains what is used; on any failure the section is simply not shown.
 */
export function ForYouSection() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { state, isPending, isError } = useForYou();

  if (isError) return null;
  if (isPending || !state) {
    return (
      <section aria-labelledby="foryou-heading" aria-busy="true">
        <SectionHeader id="foryou-heading" title={t("learn.foryou.title")} />
        <p className="sr-only" role="status">
          {t("common.loading")}
        </p>
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          <Skeleton className="h-20 rounded-3xl" />
          <Skeleton className="h-20 rounded-3xl" />
        </div>
      </section>
    );
  }
  if (state.kind === "no_consent") return <ConsentPrompt />;

  const modules = state.modules;
  const done = modules.filter((m) => m.completedAt).length;
  return (
    <section
      aria-labelledby="foryou-heading"
      className="bg-secondary/70 ring-primary/10 rounded-[2rem] p-3 ring-1 sm:p-4"
    >
      <SectionHeader
        id="foryou-heading"
        title={t("learn.foryou.title")}
        hint={
          modules.length > 0
            ? t("learn.foryou.read_count", {
                done: formatNumber(done, lang),
                total: formatNumber(modules.length, lang),
              })
            : undefined
        }
      />
      <p className="text-muted-foreground -mt-1 mb-3 text-[13px] leading-5">
        {t("learn.foryou.subtitle")}
      </p>
      {modules.length === 0 ? (
        <p className="finance-card text-muted-foreground p-4 text-sm leading-6">
          {t("learn.foryou.empty")}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {modules.map((m, i) => (
            <li
              key={m.id}
              className="rise"
              style={{ "--i": Math.min(i + 2, 8) } as React.CSSProperties}
            >
              <ForYouCard m={m} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ForYouCard({ m }: { m: ForYouModule }) {
  const { t, i18n } = useTranslation();
  const finished = Boolean(m.completedAt);
  return (
    <Link
      href={forYouHref(m.id)}
      transitionTypes={NAV_FORWARD}
      className="finance-card flex h-full min-h-20 items-center gap-3.5 p-4"
    >
      <span
        className={cn(
          "grid size-12 shrink-0 place-items-center rounded-2xl",
          finished ? "bg-positive-soft text-positive" : "bg-secondary text-primary",
        )}
      >
        {finished ? (
          <CircleCheck className="size-6" aria-hidden />
        ) : (
          <Sparkles className="size-5" aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <Pill tone="lime" className="mb-1">
          {t("learn.foryou.pill")}
        </Pill>
        <span className="block text-[15px] leading-snug font-bold">{m.module.title}</span>
        <span className="text-primary mt-0.5 line-clamp-2 block text-[13px] leading-5 font-medium">
          {t(`learn.foryou.reason.${m.reason}`)}
        </span>
        <span className="text-muted-foreground mt-1.5 flex items-center gap-1.5 text-xs font-medium">
          <Clock className="size-3" aria-hidden />
          {t("learn.foryou.minutes", { n: formatNumber(m.minutes, i18n.language) })}
          {finished && <span className="text-positive font-semibold">· {t("learn.done")}</span>}
        </span>
      </span>
      <ChevronRight className="ic-forward text-muted-foreground/60 size-5 shrink-0" aria-hidden />
    </Link>
  );
}

/** Without consent: one calm card saying what personalization uses, and a way to turn it on. */
function ConsentPrompt() {
  const { t } = useTranslation();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  if (open) return <ConsentCard onDone={() => setOpen(false)} />;
  return (
    <section aria-labelledby="foryou-heading" className="finance-card flex gap-3.5 p-4 sm:p-5">
      <span className="bg-secondary text-primary grid size-12 shrink-0 place-items-center rounded-2xl">
        <Sparkles className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="foryou-heading" className="text-[15px] leading-snug font-bold">
          {t("learn.foryou.consent_title")}
        </h2>
        <p className="text-muted-foreground mt-1 text-[13px] leading-5">
          {t("learn.foryou.consent_body")}
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          disabled={!online}
          onClick={() => setOpen(true)}
        >
          {t("learn.foryou.consent_button")}
        </Button>
        {!online && <p className="text-muted-foreground mt-2 text-xs">{t("pwa.offline_write")}</p>}
      </div>
    </section>
  );
}
