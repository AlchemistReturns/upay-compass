"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslation } from "react-i18next";
import { formatCompact, formatMoney, formatShortDate } from "@/lib/format";
import type { ForecastSnapshot } from "./use-forecast";

type Row = { day: string; label: string; balance: number; risk: boolean };

type TooltipProps = { active?: boolean; payload?: { payload: Row }[] };

function ForecastTooltip({
  active,
  payload,
  lang,
  t,
}: TooltipProps & { lang: string; t: (k: string) => string }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="bg-background rounded-lg border p-2 text-xs shadow-md">
      <div className="font-medium">{row.label}</div>
      <div className="tabular-nums">{formatMoney(row.balance, lang)}</div>
      {row.risk && <div className="mt-0.5 font-medium">{t("forecast.below_buffer")}</div>}
    </div>
  );
}

/** One line (projected balance), a dashed safety-buffer line, and red dots on the days that dip below it. */
export function ForecastChart({ snapshot }: { snapshot: ForecastSnapshot }) {
  const { t, i18n } = useTranslation();
  const [asTable, setAsTable] = useState(false);
  const lang = i18n.language;
  const buffer = snapshot.details.safetyBuffer;
  const riskDays = new Set(snapshot.risk_flags.map((r) => r.day));
  const rows: Row[] = snapshot.projected_balance.map((p) => ({
    day: p.day,
    label: formatShortDate(p.day, lang),
    balance: p.balance,
    risk: riskDays.has(p.day),
  }));
  const hasNegative = rows.some((r) => r.balance < 0);

  return (
    <section className="rounded-xl border p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-medium">{t("forecast.chart_title")}</h2>
          <p className="text-muted-foreground text-xs">{t("forecast.chart_hint")}</p>
        </div>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          className="text-muted-foreground min-h-10 text-xs underline"
        >
          {asTable ? t("dashboard.show_chart") : t("dashboard.show_table")}
        </button>
      </div>

      <ul
        className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs"
        aria-label={t("dashboard.legend")}
      >
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-0.5 w-4"
            style={{ background: "var(--chart-income)" }}
          />
          {t("forecast.legend_balance")}
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block w-4 border-t-2 border-dashed"
            style={{ borderColor: "var(--chart-axis)" }}
          />
          {t("forecast.legend_buffer")}
        </li>
        {rows.some((r) => r.risk) && (
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-full"
              style={{ background: "var(--status-critical)" }}
            />
            {t("forecast.below_buffer")}
          </li>
        )}
      </ul>

      {asTable ? (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground bg-background sticky top-0 text-left text-xs">
              <tr>
                <th className="py-1 font-normal">{t("forecast.date")}</th>
                <th className="py-1 text-right font-normal">{t("forecast.balance")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.day} className="border-t">
                  <td className="py-1.5">
                    {r.label}
                    {r.risk && (
                      <span className="text-muted-foreground ml-2 text-xs">
                        {t("forecast.below_buffer")}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{formatMoney(r.balance, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-56" role="img" aria-label={t("forecast.chart_title")}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: "var(--chart-grid)" }}
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                interval="preserveStartEnd"
                minTickGap={28}
              />
              <YAxis
                width={44}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                tickFormatter={(v: number) => formatCompact(v, lang)}
              />
              {hasNegative && <ReferenceLine y={0} stroke="var(--chart-axis)" />}
              <ReferenceLine y={buffer} stroke="var(--chart-axis)" strokeDasharray="5 4" />
              <Tooltip
                cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
                content={(props) => (
                  <ForecastTooltip
                    {...(props as unknown as TooltipProps)}
                    lang={lang}
                    t={t as (k: string) => string}
                  />
                )}
              />
              <Line
                type="monotone"
                dataKey="balance"
                stroke="var(--chart-income)"
                strokeWidth={2}
                isAnimationActive={false}
                dot={(props: { cx?: number; cy?: number; payload?: Row; index?: number }) => {
                  const { cx, cy, payload, index } = props;
                  if (!payload?.risk || cx === undefined || cy === undefined) {
                    return <g key={`d-${index}`} />;
                  }
                  return (
                    <circle
                      key={`d-${index}`}
                      cx={cx}
                      cy={cy}
                      r={3.5}
                      fill="var(--status-critical)"
                      stroke="var(--background)"
                      strokeWidth={2}
                    />
                  );
                }}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
