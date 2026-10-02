import {
  addDays,
  dayDiff,
  dhakaDay,
  generateNudges,
  projectGoal,
  type NudgeInputs,
} from "@compass/shared";
import { adminClient, authenticate, corsHeaders, json } from "../_shared/http.ts";
import { refreshForecast } from "../_shared/flow.ts";

/**
 * Evaluates the rule-driven nudges for the caller: a category at twice its usual week, a goal behind
 * schedule, a bill due within 3 days, and a forecast dip. Each nudge has a dedupe key, so calling this
 * as often as you like never creates the same alert twice. (Budget alerts are raised by database
 * triggers as spending happens.) No language model is involved.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { client, user } = auth;

  try {
    const today = dhakaDay(new Date());
    const since = `${addDays(today, -62)}T00:00:00Z`;

    const [spend, goals, contribs, snapshot] = await Promise.all([
      client
        .from("transactions")
        .select("category_id,amount,occurred_at")
        .eq("direction", "out")
        .gte("occurred_at", since)
        .limit(5000),
      client
        .from("goals")
        .select("id,title,target_amount,saved_amount,target_date,created_at")
        .eq("status", "active"),
      client
        .from("goal_contributions")
        .select("goal_id,amount,created_at")
        .gte("created_at", new Date(Date.now() - 90 * 86_400_000).toISOString()),
      refreshForecast(client, user.id),
    ]);
    if (spend.error) throw spend.error;
    if (goals.error) throw goals.error;
    if (contribs.error) throw contribs.error;

    // This week (last 7 days) against the average week over the 8 weeks before it.
    const weekly = new Map<number, { thisWeek: number; prior: number }>();
    for (const t of spend.data ?? []) {
      if (t.category_id == null) continue;
      const age = dayDiff(dhakaDay(t.occurred_at as string), today);
      const entry = weekly.get(t.category_id as number) ?? { thisWeek: 0, prior: 0 };
      if (age <= 6) entry.thisWeek += Number(t.amount);
      else entry.prior += Number(t.amount);
      weekly.set(t.category_id as number, entry);
    }

    const inputs: NudgeInputs = {
      today,
      categoryWeekly: [...weekly].map(([categoryId, v]) => ({
        categoryId,
        thisWeek: Math.round(v.thisWeek),
        avgPriorWeek: Math.round(v.prior / 8),
      })),
      goals: (goals.data ?? []).map((g) => ({
        id: g.id as string,
        title: g.title as string,
        targetDate: (g.target_date as string | null) ?? null,
        ageDays: dayDiff(dhakaDay(g.created_at as string), today),
        projection: projectGoal({
          target: Number(g.target_amount),
          saved: Number(g.saved_amount),
          targetDate: (g.target_date as string | null) ?? null,
          contributions: (contribs.data ?? [])
            .filter((c) => c.goal_id === g.id)
            .map((c) => ({ amount: Number(c.amount), created_at: c.created_at as string })),
        }),
      })),
      recurring: snapshot.forecast.recurring,
      forecast: snapshot.forecast,
    };

    const nudges = generateNudges(inputs);
    let created = 0;
    if (nudges.length > 0) {
      const { data, error } = await adminClient()
        .from("nudges")
        .upsert(
          nudges.map((n) => ({ user_id: user.id, ...n })),
          { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
        )
        .select("id");
      if (error) throw error;
      created = data?.length ?? 0;
    }
    return json({ candidates: nudges.length, created });
  } catch (e) {
    return json(
      { error: "nudges_failed", detail: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});
