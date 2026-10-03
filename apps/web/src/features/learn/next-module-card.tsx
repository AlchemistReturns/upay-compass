"use client";

import Link from "next/link";
import { BookOpen, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NAV_FORWARD } from "@/components/page-transition";
import { useRecommendations } from "./use-recommendations";

/** One line on the dashboard: the module to read next, and why. Hidden when everything is read. */
export function NextModuleCard() {
  const { t, i18n } = useTranslation();
  const { items } = useRecommendations();
  const top = items[0];
  if (!top) return null;
  const title = i18n.language === "bn" ? top.mod.title_bn : top.mod.title_en;

  return (
    <Link
      href={`/learn/${top.mod.slug}`}
      transitionTypes={NAV_FORWARD}
      className="finance-card flex min-h-[5.5rem] items-center gap-4 p-4"
    >
      <span className="icon-chip size-14 shrink-0 rounded-2xl">
        <BookOpen className="size-6" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-muted-foreground text-[12.5px] font-semibold">
          {t("learn.next_card", { title })}
        </div>
        <div className="text-primary mt-0.5 text-sm leading-snug font-semibold">
          {t(`learn.reason_${top.reason}`)}
        </div>
      </div>
      <ChevronRight className="ic-forward text-muted-foreground/60 size-5 shrink-0" aria-hidden />
    </Link>
  );
}
