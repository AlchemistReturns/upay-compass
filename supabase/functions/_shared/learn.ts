import type { SupabaseClient } from "@supabase/supabase-js";
import {
  GENERATED_MODULE_JSON_SCHEMA,
  learnMaxCompletionTokens,
  projectGoal,
  type HealthResult,
  type LearnModelClient,
  type LearnSignalInput,
  type ReadinessResult,
  type RiskFlag,
} from "@compass/shared";
import { reasonFromError, type CallMeter } from "./monitor.ts";

const DEFAULT_MODEL = "gpt-5-mini";
const TIMEOUT_MS = 45_000;

/**
 * The OpenAI client for learn modules. Model from OPENAI_LEARN_MODEL, else OPENAI_COACH_MODEL.
 * Structured output with the module schema; the token cap follows the word limits so the model
 * cannot ramble. Returns null on any failure (no key, network, HTTP error, empty reply).
 */
export const makeOpenAiLearnClient =
  (meter?: CallMeter): LearnModelClient =>
  async ({ messages, language }) => {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      meter?.reason("no_api_key");
      return null;
    }
    const model =
      Deno.env.get("OPENAI_LEARN_MODEL") || Deno.env.get("OPENAI_COACH_MODEL") || DEFAULT_MODEL;
    meter?.model(model);
    const reasoning = /^(gpt-5|o\d)/.test(model);
    const cap = learnMaxCompletionTokens(language, reasoning);

    const request = (withEffort: boolean) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      return fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          response_format: { type: "json_schema", json_schema: GENERATED_MODULE_JSON_SCHEMA },
          ...(reasoning
            ? { max_completion_tokens: cap, ...(withEffort ? { reasoning_effort: "minimal" } : {}) }
            : { max_tokens: cap, temperature: 0.4 }),
        }),
      }).finally(() => clearTimeout(timer));
    };

    try {
      let res = await request(true);
      if (res.status === 400 && reasoning) res = await request(false); // some models reject the effort
      if (!res.ok) {
        meter?.reason(`http_${res.status}`);
        return null;
      }
      const payload = await res.json();
      meter?.usage(payload?.usage);
      const content = payload?.choices?.[0]?.message?.content;
      return typeof content === "string" && content.trim() ? content : null;
    } catch (e) {
      meter?.reason(reasonFromError(e));
      return null;
    }
  };

type Row = Record<string, unknown>;

/**
 * What the topic rules need, read as the caller (RLS): the latest score snapshots, this month's
 * budgets, goal statuses, unread alert types and the latest forecast. The same sources the coach
 * reads; no transactions, names or merchants.
 */
export async function loadLearnSignalInput(
  client: SupabaseClient,
  now: Date,
): Promise<{ input: LearnSignalInput; consent: boolean; language: "bn" | "en" }> {
  const since90 = new Date(now.getTime() - 90 * 86_400_000).toISOString();
  const [profile, health, readiness, budgets, goals, contribs, nudges, forecast] =
    await Promise.all([
      client.from("profiles").select("language,income_type,coach_consent_at").single(),
      client
        .from("health_scores")
        .select("breakdown")
        .order("computed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      client
        .from("readiness_scores")
        .select("breakdown")
        .order("computed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      client.rpc("budget_progress"),
      client
        .from("goals")
        .select("id,target_amount,saved_amount,target_date")
        .eq("status", "active"),
      client
        .from("goal_contributions")
        .select("goal_id,amount,created_at")
        .gte("created_at", since90),
      client.from("nudges").select("type").eq("read", false).limit(50),
      client
        .from("forecasts")
        .select("risk_flags,details")
        .order("computed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  for (const r of [profile, health, readiness, budgets, goals, contribs, nudges, forecast]) {
    if (r.error) throw r.error;
  }

  const goalStatuses = (goals.data ?? []).map(
    (g: Row) =>
      projectGoal({
        target: Number(g.target_amount),
        saved: Number(g.saved_amount),
        targetDate: (g.target_date as string | null) ?? null,
        contributions: (contribs.data ?? [])
          .filter((c: Row) => c.goal_id === g.id)
          .map((c: Row) => ({ amount: Number(c.amount), created_at: c.created_at as string })),
        now,
      }).status,
  );
  const details = (forecast.data?.details ?? null) as {
    insufficient?: boolean;
    today?: string;
  } | null;

  return {
    consent: Boolean(profile.data?.coach_consent_at),
    language: (profile.data?.language as "bn" | "en") ?? "bn",
    input: {
      incomeType: (profile.data?.income_type as string | null) ?? null,
      health: (health.data?.breakdown as HealthResult | undefined) ?? null,
      readiness: (readiness.data?.breakdown as ReadinessResult | undefined) ?? null,
      budgets: (budgets.data ?? []).map((b: Row) => ({
        limit: Number(b.limit_amount),
        spent: Number(b.spent),
        threshold: Number(b.alert_threshold),
      })),
      goalStatuses,
      unreadNudges: (nudges.data ?? []).map((n: Row) => n.type as string),
      forecast:
        forecast.data && details?.today
          ? {
              insufficient: Boolean(details.insufficient),
              today: details.today,
              risks: (forecast.data.risk_flags ?? []) as RiskFlag[],
            }
          : null,
    },
  };
}
