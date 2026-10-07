"use client";

import { useTranslation } from "react-i18next";
import { HEALTH_RULES, estimateCostUsd, type HealthSnapshot } from "@compass/shared";
import { formatNumber } from "@/lib/format";
import { BarRows, LineChart, MixBar, Panel, StackedBars } from "./charts";
import { formatSeconds, formatUsd } from "./present";

const locale = (lang: string) => (lang === "bn" ? "bn-BD" : "en-US");

function bucketLabel(iso: string, hours: number, lang: string) {
  return new Intl.DateTimeFormat(
    locale(lang),
    hours <= 48
      ? { hour: "numeric", timeZone: "Asia/Dhaka" }
      : { day: "numeric", month: "short", hour: "numeric", timeZone: "Asia/Dhaka" },
  ).format(new Date(iso));
}

/** The chart panels, each with a table behind its toggle. Every figure comes from the aggregates. */
export function Trends({ snapshot }: { snapshot: HealthSnapshot }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const n = (v: number) => formatNumber(Math.round(v), lang);
  const { series } = snapshot;
  const labels = series.map((p) => bucketLabel(p.t, snapshot.hours, lang));
  const per = t(
    snapshot.bucket_hours === 1 ? "monitor.panels.per_hour" : "monitor.panels.per_hours",
    {
      count: snapshot.bucket_hours,
    },
  );

  const answered = series.map((p) =>
    p.calls === 0 ? null : 100 - (Math.min(p.calls, p.errors + p.fallbacks) / p.calls) * 100,
  );
  const latency = series.map((p) => (p.p95_ms === null ? null : p.p95_ms / 1000));
  const cost = series.map((p) => {
    const usage = Object.entries(p.tokens).map(([model, [tin, tout]]) => ({
      model,
      tokens_in: tin,
      tokens_out: tout,
    }));
    return estimateCostUsd(usage).usd;
  });
  const sec = (v: number) => `${formatSeconds(v * 1000, lang)} ${t("monitor.unit_seconds")}`;
  const pct = (v: number) => `${n(v)}%`;
  const dash = (v: number | null, f: (x: number) => string) => (v === null ? "–" : f(v));

  const acc = "suppressed" in snapshot.accuracy ? null : snapshot.accuracy;
  const fc = "suppressed" in snapshot.forecast ? null : snapshot.forecast;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel
        title={t("monitor.panels.requests")}
        subtitle={per}
        table={{
          head: [
            t("monitor.details.col_time"),
            t("monitor.details.col_requests"),
            t("monitor.details.col_backup"),
            t("monitor.details.col_failed"),
          ],
          rows: series.map((p, i) => [labels[i]!, n(p.calls), n(p.fallbacks), n(p.errors)]),
        }}
      >
        <StackedBars
          label={t("monitor.details.requests_label")}
          labels={labels}
          series={[
            {
              key: "ok",
              className: "fill-primary/70",
              values: series.map((p) => Math.max(0, p.calls - p.fallbacks - p.errors)),
            },
            { key: "backup", className: "fill-[#f4b24c]", values: series.map((p) => p.fallbacks) },
            { key: "failed", className: "fill-destructive", values: series.map((p) => p.errors) },
          ]}
          legend={[
            { className: "bg-primary/70", text: t("monitor.details.legend_ok") },
            { className: "bg-[#f4b24c]", text: t("monitor.details.legend_backup") },
            { className: "bg-destructive", text: t("monitor.details.legend_failed") },
          ]}
        />
      </Panel>

      <Panel
        title={t("monitor.panels.latency")}
        subtitle={t("monitor.panels.latency_sub")}
        table={{
          head: [t("monitor.details.col_time"), t("monitor.details.col_slowest")],
          rows: series.map((_, i) => [labels[i]!, dash(latency[i]!, sec)]),
        }}
      >
        <LineChart
          values={latency}
          labels={labels}
          format={sec}
          label={t("monitor.panels.latency")}
          threshold={{
            value: HEALTH_RULES.responding.okMaxMs / 1000,
            text: t("monitor.panels.healthy_line"),
          }}
        />
      </Panel>

      <Panel
        title={t("monitor.panels.available")}
        subtitle={t("monitor.panels.available_sub")}
        table={{
          head: [t("monitor.details.col_time"), t("monitor.panels.col_answered")],
          rows: series.map((_, i) => [labels[i]!, dash(answered[i]!, pct)]),
        }}
      >
        <LineChart
          values={answered}
          labels={labels}
          format={pct}
          max={100}
          label={t("monitor.panels.available")}
          threshold={{
            value: HEALTH_RULES.ai_available.okMinPct,
            text: t("monitor.panels.healthy_line"),
          }}
        />
      </Panel>

      <Panel
        title={t("monitor.panels.cost")}
        subtitle={t("monitor.panels.cost_sub")}
        table={{
          head: [t("monitor.details.col_time"), t("monitor.panels.col_cost")],
          rows: series.map((_, i) => [labels[i]!, formatUsd(cost[i]!, lang)]),
        }}
      >
        <LineChart
          values={cost}
          labels={labels}
          format={(v) => formatUsd(v, lang)}
          label={t("monitor.panels.cost")}
        />
      </Panel>

      <Panel
        title={t("monitor.details.features_title")}
        subtitle={t("monitor.panels.features_sub")}
        table={{
          head: [
            t("monitor.details.col_feature"),
            t("monitor.details.col_requests"),
            t("monitor.details.col_backup"),
            t("monitor.details.col_failed"),
            t("monitor.details.col_slowest"),
          ],
          rows: snapshot.functions.map((f) => [
            t(`monitor.features.${f.function_name.replace(/-/g, "_")}`, {
              defaultValue: f.function_name,
            }),
            n(f.calls),
            n(f.fallbacks),
            n(f.errors),
            f.p95_ms === null ? "–" : sec(f.p95_ms / 1000),
          ]),
        }}
      >
        <BarRows
          rows={snapshot.functions.map((f) => ({
            name: t(`monitor.features.${f.function_name.replace(/-/g, "_")}`, {
              defaultValue: f.function_name,
            }),
            value: f.calls,
            valueText: n(f.calls),
            bad: Math.min(f.calls, f.fallbacks + f.errors),
            extra: f.p95_ms === null ? undefined : sec(f.p95_ms / 1000),
          }))}
        />
      </Panel>

      <div className="grid grid-cols-1 gap-4">
        <Panel title={t("monitor.panels.filing")} subtitle={t("monitor.panels.filing_sub")}>
          {acc ? (
            <MixBar
              label={t("monitor.panels.filing")}
              parts={[
                {
                  text: t("monitor.panels.mix_rules"),
                  pct: (acc.by_rule / acc.payments) * 100,
                  className: "bg-primary/75",
                },
                {
                  text: t("monitor.panels.mix_ai"),
                  pct: (acc.by_ai / acc.payments) * 100,
                  className: "bg-[#7aa7e0]",
                },
                {
                  text: t("monitor.panels.mix_review"),
                  pct: (acc.needs_review / acc.payments) * 100,
                  className: "bg-[#f4b24c]",
                },
                {
                  text: t("monitor.panels.mix_corrected"),
                  pct: (acc.corrected / acc.payments) * 100,
                  className: "bg-[#c97ab5]",
                },
              ]}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              {t("monitor.hidden", { count: snapshot.min_group_size })}
            </p>
          )}
        </Panel>
        <Panel title={t("monitor.panels.forecast")} subtitle={t("monitor.panels.forecast_sub")}>
          {fc ? (
            <div className="space-y-3">
              <p className="num text-3xl leading-none font-extrabold">
                {pct((fc.better / fc.people) * 100)}
              </p>
              <p className="text-muted-foreground text-sm leading-6">
                {t("monitor.panels.forecast_text", { people: n(fc.people) })}
              </p>
              <div className="bg-muted h-2.5 overflow-hidden rounded-full">
                <span
                  className="bg-primary/75 block h-full"
                  style={{ width: `${(fc.better / fc.people) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              {t("monitor.hidden", { count: snapshot.min_group_size })}
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
