"use client";

import Link from "next/link";
import { ChevronRight, CircleCheck, Info, OctagonAlert, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatMoney, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRealtimeInvalidate } from "@/features/realtime/use-realtime-invalidate";
import { useLatestForecast } from "./use-forecast";
import { NAV_FORWARD } from "@/components/page-transition";

const TONE = {
  neutral: { chip: "bg-secondary text-primary", Icon: Info },
  good: { chip: "bg-positive-soft text-positive", Icon: CircleCheck },
  warn: { chip: "bg-warning-soft text-warning-ink", Icon: TriangleAlert },
  critical: { chip: "bg-negative-soft text-destructive", Icon: OctagonAlert },
} as const;

/** Dashboard teaser for the 30-day forecast: the verdict in one line, with an icon and words. */
export function ForecastCard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const forecast = useLatestForecast();
  useRealtimeInvalidate("forecasts", [["forecast"]]);
  const d = forecast.data?.details;

  let line = t("forecast.see_yours");
  let tone: keyof typeof TONE = "neutral";
  if (d?.insufficient) {
    line = t("forecast.card_insufficient");
  } else if (d && d.lowest && d.firstRiskDay) {
    const negative = d.lowest.balance < 0;
    tone = negative ? "critical" : "warn";
    line = t(negative ? "forecast.card_negative" : "forecast.card_low", {
      day: formatShortDate(d.lowest.day, lang),
      amount: formatMoney(d.lowest.balance, lang),
    });
  } else if (d) {
    tone = "good";
    line = t("forecast.card_ok");
  }
  const { chip, Icon } = TONE[tone];

  return (
    <Link
      href="/forecast"
      transitionTypes={NAV_FORWARD}
      className="finance-card flex min-h-[5.5rem] items-center gap-4 p-4"
    >
      <span className={cn("grid size-14 shrink-0 place-items-center rounded-[1.1rem]", chip)}>
        <Icon className="size-6" strokeWidth={2} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-muted-foreground text-[12.5px] font-semibold">
          {t("forecast.title")}
        </div>
        <div className="mt-0.5 text-sm leading-snug font-semibold">{line}</div>
      </div>
      <ChevronRight className="text-muted-foreground/60 size-5 shrink-0" aria-hidden />
    </Link>
  );
}
