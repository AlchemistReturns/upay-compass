import {
  costPerActiveUserMonth,
  estimateCostUsd,
  type HealthSnapshot,
  type Metric,
  type MetricId,
  type Status,
} from "@compass/shared";
import { formatNumber } from "@/lib/format";

export const METRIC_ORDER: MetricId[] = [
  "responding",
  "ai_available",
  "safety",
  "accuracy",
  "forecast",
  "cost",
];

type Params = Record<string, string | number>;

export type CardModel = {
  id: MetricId;
  status: Status;
  hidden: boolean;
  /** the large number, already formatted for the language */
  big: string;
  /** what the number counts, as a translation key with params */
  caption: { key: string; params?: Params };
  meaning: { key: string; params?: Params };
  /** a trend over the window, null where there is no honest time series */
  series: (number | null)[] | null;
};

const locale = (lang: string) => (lang === "bn" ? "bn-BD" : "en-US");

function decimal(n: number, lang: string, digits = 1) {
  return n.toLocaleString(locale(lang), { maximumFractionDigits: digits });
}

export function formatSeconds(ms: number, lang: string) {
  return decimal(ms / 1000, lang, ms < 10_000 ? 1 : 0);
}

export function formatUsd(n: number, lang: string) {
  return n.toLocaleString(locale(lang), {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: n < 0.1 ? 3 : 2,
  });
}

const share = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null);

/** Turns the evaluated metrics into what each card shows: numbers formatted, sentences as keys. */
export function buildCards(
  snapshot: HealthSnapshot,
  metrics: readonly Metric[],
  lang: string,
  minimums: Record<MetricId, number>,
): CardModel[] {
  const pctText = (n: number) => `${formatNumber(Math.round(n), lang)}%`;
  const n0 = (n: number) => formatNumber(Math.round(n), lang);

  return METRIC_ORDER.map((id): CardModel => {
    const m = metrics.find((x) => x.id === id)!;
    const key = (k: string, params?: Params) => ({ key: `monitor.cards.${id}.${k}`, params });
    const done = (
      big: string,
      caption: CardModel["caption"],
      meaning: CardModel["meaning"],
      series: CardModel["series"],
    ): CardModel => ({ id, status: m.status, hidden: false, big, caption, meaning, series });

    if (m.status === "unknown") {
      return {
        id,
        status: "unknown",
        hidden: Boolean(m.hidden),
        big: "–",
        caption: key("caption"),
        meaning: m.hidden
          ? { key: "monitor.hidden", params: { count: snapshot.min_group_size } }
          : key("unknown", { min: n0(minimums[id]) }),
        series: null,
      };
    }

    switch (id) {
      case "responding":
        return done(
          formatSeconds(m.value!, lang),
          key("caption"),
          key("meaning", {
            typical: formatSeconds(m.value!, lang),
            slowest: formatSeconds(m.extra.p95_ms!, lang),
          }),
          snapshot.series.map((p) => (p.p95_ms === null ? null : p.p95_ms / 1000)),
        );
      case "ai_available":
        return done(
          pctText(m.value!),
          key("caption"),
          key("meaning", { unavailable: n0(m.extra.unavailable!), total: n0(m.sample) }),
          snapshot.series.map((p) => {
            const bad = Math.min(p.calls, p.errors + p.fallbacks);
            return p.calls === 0 ? null : 100 - (share(bad, p.calls) ?? 0);
          }),
        );
      case "safety":
        return done(
          pctText(m.value!),
          key("caption"),
          key("meaning", { stopped: n0(m.extra.stopped!), checked: n0(m.extra.checked!) }),
          snapshot.series.map((p) => share(p.stopped, p.checked)),
        );
      case "accuracy":
        return done(
          pctText(m.value!),
          key("caption"),
          key("meaning", {
            rules: n0(m.extra.by_rule_pct!),
            ai: n0(m.extra.by_ai_pct!),
            corrected: n0(m.extra.corrected_pct!),
            people: n0(m.extra.people!),
          }),
          null,
        );
      case "forecast":
        return done(
          pctText(Math.abs(m.value!)),
          key(m.value! >= 0 ? "caption_better" : "caption_worse"),
          key("meaning", { better: n0(m.extra.better_pct!), people: n0(m.sample) }),
          null,
        );
      case "cost":
        return done(
          formatUsd(costPerActiveUserMonth(snapshot)!, lang),
          key("caption"),
          key("meaning", { people: n0(m.extra.people!) }),
          snapshot.series.map((p) => {
            const usage = Object.entries(p.tokens).map(([model, [tin, tout]]) => ({
              model,
              tokens_in: tin,
              tokens_out: tout,
            }));
            return estimateCostUsd(usage).usd;
          }),
        );
    }
  });
}
