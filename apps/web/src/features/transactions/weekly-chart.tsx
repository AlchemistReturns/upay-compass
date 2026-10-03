"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import { formatCompact, formatMoney, formatShortDate } from "@/lib/format";
import type { WeekPoint } from "./types";

function Swatch({ color }: { color: string }) {
  return (
    <span aria-hidden className="inline-block size-2.5 rounded-sm" style={{ background: color }} />
  );
}

type TooltipProps = {
  active?: boolean;
  label?: string;
  payload?: { dataKey: string; value: number }[];
};

function WeekTooltip({
  active,
  label,
  payload,
  lang,
  t,
}: TooltipProps & { lang: string; t: (k: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card rounded-xl border p-2.5 text-xs shadow-lg">
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <Swatch color={p.dataKey === "income" ? "var(--chart-income)" : "var(--chart-expense)"} />
          <span className="text-muted-foreground">{t(`dashboard.${p.dataKey}`)}</span>
          <span className="ml-auto pl-3 tabular-nums">{formatMoney(p.value, lang)}</span>
        </div>
      ))}
    </div>
  );
}

export function WeeklyChart({ data }: { data: WeekPoint[] }) {
  const { t, i18n } = useTranslation();
  const [asTable, setAsTable] = useState(false);
  const lang = i18n.language;
  const rows = data.map((w) => ({ ...w, label: formatShortDate(w.week_start, lang) }));

  return (
    <section className="finance-card p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="section-title">{t("dashboard.weekly_title")}</h2>
          <p className="text-muted-foreground text-xs">{t("dashboard.weekly_hint")}</p>
        </div>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          className="text-primary hover:bg-secondary min-h-11 min-w-11 shrink-0 rounded-full px-3 text-xs font-medium transition-colors"
        >
          {asTable ? t("dashboard.show_chart") : t("dashboard.show_table")}
        </button>
      </div>

      <ul className="mb-2 flex gap-4 text-xs" aria-label={t("dashboard.legend")}>
        <li className="flex items-center gap-1.5">
          <Swatch color="var(--chart-income)" />
          {t("dashboard.income")}
        </li>
        <li className="flex items-center gap-1.5">
          <Swatch color="var(--chart-expense)" />
          {t("dashboard.expense")}
        </li>
      </ul>

      {asTable ? (
        <table className="w-full text-sm">
          <thead className="text-muted-foreground text-left text-xs">
            <tr>
              <th className="py-1 font-normal">{t("dashboard.week_of")}</th>
              <th className="py-1 text-right font-normal">{t("dashboard.income")}</th>
              <th className="py-1 text-right font-normal">{t("dashboard.expense")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.week_start} className="border-t">
                <td className="py-1.5">{r.label}</td>
                <td className="py-1.5 text-right tabular-nums">{formatMoney(r.income, lang)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatMoney(r.expense, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="h-52" role="img" aria-label={t("dashboard.weekly_title")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} barGap={2} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: "var(--chart-grid)" }}
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis
                width={40}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                tickFormatter={(v: number) => formatCompact(v, lang)}
              />
              <Tooltip
                cursor={{ fill: "var(--chart-cursor)" }}
                content={(props) => (
                  <WeekTooltip
                    {...(props as unknown as TooltipProps)}
                    lang={lang}
                    t={t as (k: string) => string}
                  />
                )}
              />
              <Bar
                dataKey="income"
                fill="var(--chart-income)"
                radius={[4, 4, 0, 0]}
                maxBarSize={14}
              />
              <Bar
                dataKey="expense"
                fill="var(--chart-expense)"
                radius={[4, 4, 0, 0]}
                maxBarSize={14}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
