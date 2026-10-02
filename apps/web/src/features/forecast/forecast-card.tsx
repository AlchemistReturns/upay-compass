"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, Info, OctagonAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatMoney, formatShortDate } from "@/lib/format";
import { useRealtimeInvalidate } from "@/features/realtime/use-realtime-invalidate";
import { useLatestForecast } from "./use-forecast";

/** Dashboard teaser for the 30-day forecast: the verdict in one line, with an icon and words. */
export function ForecastCard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const forecast = useLatestForecast();
  useRealtimeInvalidate("forecasts", [["forecast"]]);
  const d = forecast.data?.details;

  let line = t("forecast.see_yours");
  let Icon = Info;
  let color = "currentColor";
  if (d?.insufficient) {
    line = t("forecast.card_insufficient");
  } else if (d && d.lowest && d.firstRiskDay) {
    const negative = d.lowest.balance < 0;
    Icon = negative ? OctagonAlert : AlertTriangle;
    color = negative ? "var(--status-critical)" : "var(--status-warning)";
    line = t(negative ? "forecast.card_negative" : "forecast.card_low", {
      day: formatShortDate(d.lowest.day, lang),
      amount: formatMoney(d.lowest.balance, lang),
    });
  } else if (d) {
    Icon = CheckCircle2;
    color = "var(--status-good)";
    line = t("forecast.card_ok");
  }

  return (
    <Link href="/forecast" className="flex min-h-16 items-center gap-3 rounded-xl border p-3">
      <Icon className="size-5 shrink-0" style={{ color }} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-muted-foreground text-xs">{t("forecast.title")}</div>
        <div className="text-sm">{line}</div>
      </div>
      <ChevronRight className="text-muted-foreground size-5" aria-hidden />
    </Link>
  );
}
