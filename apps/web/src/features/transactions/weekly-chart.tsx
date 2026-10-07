"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import { formatCompact, formatMoney, formatShortDate } from "@/lib/format";
import { ChartToggle } from "./chart-toggle";
import type { WeekPoint } from "./types";

function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 rounded-full"
      style={{ background: color }}
    />
  );
}

type TooltipProps = {
  active?: boolean;
  label?: string;
  payload?: { dataKey: string; value: number }[];
};

export function ChartTooltip({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-brand-ink text-on-dark dark:bg-elevated dark:text-foreground min-w-36 dark:ring-1 dark:ring-white/10 rounded-2xl px-3 py-2.5 text-xs shadow-[0_12px_30px_-10px_rgba(18, 58, 128,.6)]">
      <div className="text-on-dark-muted mb-1.5 font-semibold">{title}</div>
      {children}
    </div>
  );
}

function WeekTooltip({
  active,
  label,
  payload,
  lang,
  t,
}: TooltipProps & { lang: string; t: (k: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <ChartTooltip title={label ?? ""}>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 py-0.5">
          <Swatch color={p.dataKey === "income" ? "#a8d878" : "#7fb3b0"} />
          <span className="text-on-dark-muted">{t(`dashboard.${p.dataKey}`)}</span>
          <span className="num ml-auto pl-3 font-bold">{formatMoney(p.value, lang)}</span>
        </div>
      ))}
    </ChartTooltip>
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
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold">{t("dashboard.weekly_title")}</h3>
          <p className="text-muted-foreground text-[12.5px]">{t("dashboard.weekly_hint")}</p>
        </div>
        <ChartToggle asTable={asTable} onToggle={() => setAsTable((v) => !v)} />
      </div>

      <ul className="mb-3 flex gap-4 text-[12.5px] font-medium" aria-label={t("dashboard.legend")}>
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
        <table className="fade-in w-full text-sm">
          <thead className="text-muted-foreground text-left text-xs">
            <tr>
              <th className="py-1.5 font-semibold">{t("dashboard.week_of")}</th>
              <th className="py-1.5 text-right font-semibold">{t("dashboard.income")}</th>
              <th className="py-1.5 text-right font-semibold">{t("dashboard.expense")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.week_start} className="border-t border-hairline">
                <td className="py-2">{r.label}</td>
                <td className="num py-2 text-right">{formatMoney(r.income, lang)}</td>
                <td className="num py-2 text-right">{formatMoney(r.expense, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="fade-in -ml-1 h-52" role="img" aria-label={t("dashboard.weekly_title")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} barGap={3} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 4" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                interval="preserveStartEnd"
                tickMargin={8}
              />
              <YAxis
                width={38}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                tickFormatter={(v: number) => formatCompact(v, lang)}
              />
              <Tooltip
                cursor={{ fill: "var(--chart-cursor)", radius: 10 } as object}
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
                radius={[6, 6, 6, 6]}
                maxBarSize={12}
              />
              <Bar
                dataKey="expense"
                fill="var(--chart-expense)"
                radius={[6, 6, 6, 6]}
                maxBarSize={12}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
