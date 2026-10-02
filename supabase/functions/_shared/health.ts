import type { SupabaseClient } from "@supabase/supabase-js";
import { computeHealthScore, parseHealthInputs } from "@compass/shared";
import { adminClient } from "./http.ts";

/** Round every number so float noise never creates a "new" snapshot. */
function roundDeep(value: unknown): unknown {
  if (typeof value === "number") return Math.round(value * 10_000) / 10_000;
  if (Array.isArray(value)) return value.map(roundDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, roundDeep(v)]));
  }
  return value;
}

/** Key-order-independent text, because jsonb does not keep key order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export type RefreshResult = { score: number; confidence: string; changed: boolean } | null;

/**
 * Recomputes the caller's health score from the last 90 days and stores a snapshot when something
 * changed (otherwise it only refreshes the timestamp). `userClient` acts as the caller, so the
 * aggregates are theirs alone; the snapshot is written with the service role.
 */
export async function refreshHealthScore(
  userClient: SupabaseClient,
  userId: string,
): Promise<RefreshResult> {
  const { data, error } = await userClient.rpc("health_inputs");
  if (error) throw error;

  const inputs = parseHealthInputs(data);
  if (inputs.txCount === 0) return null; // nothing to score yet

  const result = roundDeep(computeHealthScore(inputs)) as ReturnType<typeof computeHealthScore>;
  const admin = adminClient();

  const { data: latest } = await admin
    .from("health_scores")
    .select("id,score,breakdown")
    .eq("user_id", userId)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (
    latest &&
    latest.score === result.score &&
    canonical(latest.breakdown) === canonical(result)
  ) {
    await admin
      .from("health_scores")
      .update({ computed_at: new Date().toISOString() })
      .eq("id", latest.id);
    return { score: result.score, confidence: result.confidence, changed: false };
  }

  const { error: insertError } = await admin
    .from("health_scores")
    .insert({ user_id: userId, score: result.score, breakdown: result });
  if (insertError) throw insertError;
  return { score: result.score, confidence: result.confidence, changed: true };
}
