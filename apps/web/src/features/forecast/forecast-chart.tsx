"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslation } from "react-i18next";
import { formatCompact, formatMoney, formatShortDate } from "@/lib/format";
import { ChartToggle } from "@/features/transactions/chart-toggle";
import { ChartTooltip } from "@/features/transactions/weekly-chart";
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
    <ChartTooltip title={row.label}>
      <div className="num text-sm font-bold">{formatMoney(row.balance, lang)}</div>
      {row.risk && (
        <div className="mt-0.5 font-semibold text-[#ffb59e]">{t("forecast.below_buffer")}</div>
      )}
    </ChartTooltip>
  );
}

/** Projected balance as a filled area, a dashed safety-buffer line, and red dots on days below it. */
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
    <section className="finance-card rise p-4 sm:p-5" style={{ "--i": 1 } as React.CSSProperties}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold">{t("forecast.chart_title")}</h2>
          <p className="text-muted-foreground text-[12.5px] leading-5">
            {t("forecast.chart_hint")}
          </p>
        </div>
        <ChartToggle asTable={asTable} onToggle={() => setAsTable((v) => !v)} />
      </div>

      <ul
        className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] font-medium"
        aria-label={t("dashboard.legend")}
      >
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-[3px] w-4 rounded-full"
            style={{ background: "var(--chart-expense)" }}
          />
          {t("forecast.legend_balance")}
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block w-4 border-t-2 border-dashed"
            style={{ borderColor: "var(--status-warning)" }}
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
        <div className="fade-in max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground bg-card sticky top-0 text-left text-xs">
              <tr>
                <th className="py-1.5 font-semibold">{t("forecast.date")}</th>
                <th className="py-1.5 text-right font-semibold">{t("forecast.balance")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.day} className="border-t border-[rgba(13,75,76,.07)]">
                  <td className="py-2">
                    {r.label}
                    {r.risk && (
                      <span className="text-destructive ml-2 text-xs font-semibold">
                        {t("forecast.below_buffer")}
                      </span>
                    )}
                  </td>
                  <td className="num py-2 text-right">{formatMoney(r.balance, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="fade-in -ml-1 h-60" role="img" aria-label={t("forecast.chart_title")}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 8, right: 6, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="forecast-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#79bf57" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#79bf57" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 4" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                interval="preserveStartEnd"
                minTickGap={28}
                tickMargin={8}
              />
              <YAxis
                width={42}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                tickFormatter={(v: number) => formatCompact(v, lang)}
              />
              {hasNegative && <ReferenceLine y={0} stroke="var(--chart-axis)" />}
              <ReferenceLine
                y={buffer}
                stroke="var(--status-warning)"
                strokeWidth={1.5}
                strokeDasharray="6 5"
              />
              <Tooltip
                cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1, strokeDasharray: "3 3" }}
                content={(props) => (
                  <ForecastTooltip
                    {...(props as unknown as TooltipProps)}
                    lang={lang}
                    t={t as (k: string) => string}
                  />
                )}
              />
              <Area
                type="monotone"
                dataKey="balance"
                stroke="var(--chart-expense)"
                strokeWidth={2.5}
                fill="url(#forecast-fill)"
                animationDuration={900}
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
                      r={4}
                      fill="var(--status-critical)"
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  );
                }}
                activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2, fill: "var(--chart-expense)" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
