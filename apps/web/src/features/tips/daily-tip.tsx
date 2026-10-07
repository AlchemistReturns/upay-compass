"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Lightbulb, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { dhakaDay, pickDailyTip } from "@compass/shared";
import { Pill } from "@/components/compass";
import { formatMoney, formatShortDate } from "@/lib/format";
import { useHealthSnapshots } from "@/features/health/use-health";
import { useLatestForecast } from "@/features/forecast/use-forecast";
import { COACH_PREFILL_KEY } from "@/features/voice/voice-sheet";

/**
 * Tip of the day on the dashboard. The tip is chosen by rules from this person's own forecast and
 * score (see pickDailyTip), so it is personal when there is something to say and a rotating habit
 * tip otherwise. "Ask your coach" hands the tip to the coach so it can be explained with real numbers.
 */
export function DailyTip() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const lang = i18n.language;
  const health = useHealthSnapshots();
  const forecast = useLatestForecast();

  const tip = useMemo(() => {
    const d = forecast.data?.details;
    return pickDailyTip({
      today: dhakaDay(new Date()),
      health: health.data?.[0]?.breakdown ?? null,
      forecast: d
        ? {
            insufficient: d.insufficient,
            lowest: d.lowest,
            firstRiskDay: d.firstRiskDay,
          }
        : null,
    });
  }, [health.data, forecast.data]);

  const body = t(`tips.${tip.id}`, {
    day: typeof tip.params.day === "string" ? formatShortDate(tip.params.day, lang) : "",
    amount: formatMoney(Number(tip.params.amount ?? 0), lang),
  });

  function askCoach() {
    try {
      sessionStorage.setItem(COACH_PREFILL_KEY, t("tips.coach_question", { tip: body }));
    } catch {
      // the coach opens without the question; nothing else to do
    }
    router.push("/coach");
  }

  return (
    <section
      aria-labelledby="daily-tip-heading"
      className="finance-card rise flex flex-col gap-3 p-4 sm:p-5"
      style={{ "--i": 2 } as React.CSSProperties}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="daily-tip-heading" className="flex items-center gap-2 text-[14px] font-bold">
          <span className="bg-warning-soft text-warning-ink grid size-8 place-items-center rounded-full">
            <Lightbulb className="size-4" aria-hidden />
          </span>
          {t("tips.title")}
        </h2>
        <Pill tone={tip.personal ? "good" : "mint"}>
          {tip.personal ? t("tips.for_you") : t("tips.general")}
        </Pill>
      </div>
      <p className="text-[15px] leading-relaxed">{body}</p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] font-semibold">
        <Link href={tip.href} className="text-primary inline-flex min-h-11 items-center gap-1">
          {t("tips.go")}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
        <button
          type="button"
          onClick={askCoach}
          className="text-primary inline-flex min-h-11 items-center gap-1"
        >
          <Sparkles className="size-4" aria-hidden />
          {t("tips.ask")}
        </button>
      </div>
    </section>
  );
}
