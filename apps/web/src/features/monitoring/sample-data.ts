import { summarizeEvents, type HealthSnapshot, type ModelEvent } from "@compass/shared";

/**
 * SIMULATED traffic for demonstrating the page without live users. It is generated here, in the
 * browser, from a fixed seed; it is never sent anywhere and never written to the database.
 */
export type Scenario = "normal" | "outage";

/** Small deterministic random numbers (mulberry32), so the same view always looks the same. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Kind = {
  fn: string;
  weight: number;
  model: string;
  medianMs: number;
  tokensIn: number;
  tokensOut: number;
  /** chance a validator stops the output on a normal day */
  stopRate: number;
  /** what the person sees when the AI is down: a backup answer or an error */
  whenDown: "fallback" | "error";
};

const KINDS: Kind[] = [
  {
    fn: "coach-chat",
    weight: 0.55,
    model: "gpt-5-mini",
    medianMs: 7000,
    tokensIn: 1200,
    tokensOut: 350,
    stopRate: 0,
    whenDown: "fallback",
  },
  {
    fn: "categorize-transaction",
    weight: 0.15,
    model: "gpt-4o-mini",
    medianMs: 1100,
    tokensIn: 600,
    tokensOut: 90,
    stopRate: 0.03,
    whenDown: "fallback",
  },
  {
    fn: "voice-command",
    weight: 0.14,
    model: "gpt-4.1-mini",
    medianMs: 1500,
    tokensIn: 700,
    tokensOut: 60,
    stopRate: 0.08,
    whenDown: "error",
  },
  {
    fn: "voice-transcribe",
    weight: 0.08,
    model: "gpt-4o-transcribe",
    medianMs: 1900,
    tokensIn: 160,
    tokensOut: 40,
    stopRate: 0,
    whenDown: "error",
  },
  {
    fn: "voice-speak",
    weight: 0.04,
    model: "tts-1",
    medianMs: 1300,
    tokensIn: 0,
    tokensOut: 0,
    stopRate: 0,
    whenDown: "error",
  },
  {
    fn: "generate-learn-modules",
    weight: 0.04,
    model: "gpt-5-mini",
    medianMs: 18000,
    tokensIn: 2500,
    tokensOut: 1400,
    stopRate: 0.05,
    whenDown: "fallback",
  },
];

const HOUR = 3_600_000;
const OUTAGE_HOURS = 6;

export function simulateSnapshot(scenario: Scenario, hours: number, now: number): HealthSnapshot {
  const rand = rng(hours * 7 + (scenario === "outage" ? 101 : 11));
  const events: ModelEvent[] = [];

  for (let h = 0; h < hours; h++) {
    const hourOfDay = new Date(now - h * HOUR + 6 * HOUR).getUTCHours();
    // quiet at night, busier in the evening
    const diurnal = hourOfDay < 6 ? 0.15 : hourOfDay < 17 ? 1 : hourOfDay < 23 ? 1.6 : 0.5;
    const count = Math.floor(4.2 * diurnal + rand());
    const down = scenario === "outage" && h < OUTAGE_HOURS;

    for (let i = 0; i < count; i++) {
      let pick = rand();
      const kind = KINDS.find((k) => (pick -= k.weight) <= 0) ?? KINDS[0]!;
      const jitter = 0.5 + rand() * 1.1;
      const base: ModelEvent = {
        at: now - (h + rand()) * HOUR,
        function_name: kind.fn,
        status: "ok",
        latency_ms: Math.round(kind.medianMs * jitter),
        model: kind.model,
        tokens_in: kind.tokensIn ? Math.round(kind.tokensIn * jitter) : null,
        tokens_out: kind.tokensOut ? Math.round(kind.tokensOut * jitter) : null,
        fallback_used: false,
        reason_code: null,
      };
      const noTokens = { tokens_in: null, tokens_out: null };
      if (down) {
        events.push({
          ...base,
          ...noTokens,
          status: kind.whenDown === "error" ? "error" : "ok",
          fallback_used: kind.whenDown === "fallback",
          latency_ms: Math.round(1200 + rand() * 800),
          reason_code: "http_503",
        });
      } else if (rand() < 0.012) {
        events.push({ ...base, ...noTokens, fallback_used: true, reason_code: "timeout" });
      } else if (rand() < 0.006) {
        events.push({ ...base, ...noTokens, status: "error", reason_code: "http_500" });
      } else if (kind.stopRate > 0 && rand() < kind.stopRate) {
        events.push({ ...base, reason_code: "check_unclear" });
      } else {
        events.push(base);
      }
    }
  }

  return summarizeEvents(events, hours, now, {
    active_users: { people: 30 },
    accuracy: {
      people: 12,
      payments: 480,
      by_rule: 360,
      by_ai: 45,
      corrected: 40,
      needs_review: 35,
    },
    forecast: { people: 12, better: 11, median_improvement_pct: 41 },
  });
}
