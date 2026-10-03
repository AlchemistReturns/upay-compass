import {
  RECURRING_LOOKBACK_DAYS,
  addDays,
  dayDiff,
  detectAnomalies,
  dhakaDay,
  generateNudges,
  projectGoal,
  type AnomalyTx,
  type NudgeInputs,
} from "@compass/shared";
import { adminClient, authenticate, corsHeaders, json } from "../_shared/http.ts";
import { refreshForecast } from "../_shared/flow.ts";

/**
 * Evaluates the rule-driven nudges for the caller: an unusual payment (statistical detector, replaces
 * the old "category at twice its usual week" rule), a goal behind schedule, a bill due within 3 days,
 * and a forecast dip. Each nudge has a dedupe key, so calling this as often as you like never creates
 * the same alert twice. (Budget alerts are raised by database triggers as spending happens.) No
 * language model is involved.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { client, user } = auth;

  try {
    const today = dhakaDay(new Date());
    // 125 days: the 90-day comparison window plus the look-back the recurring-payment detector needs.
    const since = `${addDays(today, -(RECURRING_LOOKBACK_DAYS + 5))}T00:00:00Z`;

    const [txs, goals, contribs, snapshot] = await Promise.all([
      client
        .from("transactions")
        .select("id,amount,direction,channel,counterparty,occurred_at,category_id,categories(key)")
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: true })
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
    if (txs.error) throw txs.error;
    if (goals.error) throw goals.error;
    if (contribs.error) throw contribs.error;

    // Unusual payments in the last 7 days, compared with this person's own history.
    const categoryIdByTx = new Map<string, number | null>();
    const history: AnomalyTx[] = (txs.data ?? []).map((t) => {
      categoryIdByTx.set(t.id as string, (t.category_id as number | null) ?? null);
      const cat = t.categories as unknown as { key: string } | null;
      return {
        id: t.id as string,
        direction: t.direction as "in" | "out",
        channel: t.channel as AnomalyTx["channel"],
        counterparty: t.counterparty as string,
        amount: Number(t.amount),
        occurred_at: t.occurred_at as string,
        category: cat?.key ?? null,
      };
    });
    const byId = new Map(history.map((t) => [t.id, t]));
    const unusual = detectAnomalies(history, { candidateFrom: addDays(today, -6) }, new Date()).map(
      (a) => ({
        type: "unusual_transaction" as const,
        data: {
          transaction_id: a.txId,
          category_id: categoryIdByTx.get(a.txId) ?? null,
          counterparty: byId.get(a.txId)?.counterparty ?? "",
          amount: a.amount,
          typical: a.typical,
          z: a.z,
          rule: a.rule,
          bucket: a.bucket,
          observations: a.observations,
        },
        dedupe_key: `unusual:${a.txId}`,
      }),
    );

    const inputs: NudgeInputs = {
      today,
      // The flat "category at 2x its usual week" rule is replaced by the unusual-payment detector.
      categoryWeekly: [],
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

    const nudges = [...unusual, ...generateNudges(inputs)];
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
