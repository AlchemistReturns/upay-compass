import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeReadiness,
  parseHealthInputs,
  parseSavingsActivity,
  type ReadinessResult,
} from "@compass/shared";
import { adminClient } from "./http.ts";
import { loadFlow } from "./flow.ts";
import { canonical, roundDeep } from "./snapshot.ts";

export type ReadinessRefresh = { score: number; confidence: string; changed: boolean } | null;

/**
 * Recomputes the caller's credit readiness (informational only) from the same 90-day inputs as the
 * health score, plus the recurring-payment detector and their saving activity, and stores a
 * snapshot when something changed (otherwise it only refreshes the timestamp). `userClient`
 * acts as the caller, so RLS applies; the snapshot is written with the service role.
 */
export async function refreshReadiness(
  userClient: SupabaseClient,
  userId: string,
): Promise<ReadinessRefresh> {
  const [health, savings, flow] = await Promise.all([
    userClient.rpc("health_inputs"),
    userClient.rpc("savings_activity"),
    loadFlow(userClient),
  ]);
  if (health.error) throw health.error;
  if (savings.error) throw savings.error;

  const inputs = parseHealthInputs(health.data);
  if (inputs.txCount === 0) return null; // nothing to score yet

  const result: ReadinessResult = roundDeep(
    computeReadiness({
      txCount: inputs.txCount,
      historyDays: inputs.historyDays,
      incomeBuckets: inputs.incomeBuckets,
      budgets: inputs.budgets,
      transactions: flow.transactions,
      now: new Date(),
      ...parseSavingsActivity(savings.data),
    }),
  );

  const admin = adminClient();
  const { data: latest } = await admin
    .from("readiness_scores")
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
      .from("readiness_scores")
      .update({ computed_at: new Date().toISOString() })
      .eq("id", latest.id);
    return { score: result.score, confidence: result.confidence, changed: false };
  }

  const { error } = await admin
    .from("readiness_scores")
    .insert({ user_id: userId, score: result.score, breakdown: result });
  if (error) throw error;
  return { score: result.score, confidence: result.confidence, changed: true };
}
