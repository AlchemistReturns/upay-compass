import { adminClient, authenticate, corsHeaders, json } from "../_shared/http.ts";
import { takeSlot } from "../_shared/limits.ts";

/** At most this many downloads per person in this many minutes. */
const RATE_LIMIT = 5;
const RATE_WINDOW_MINUTES = 60;
const PAGE = 1000;

/**
 * Every table that holds the signed-in person's own rows, with the column to page by. The caller's
 * own client reads them, so row level security is a second guard on top of the filters here.
 * Left out on purpose: user_pins (the PIN hash), user_passkeys (public keys; only the device list
 * is exported), passkey_challenges, model_events (holds no user id) and the shared reference
 * tables (categories, learn_modules).
 * Keep this list in step with the tables in supabase/migrations that have a user_id.
 */
const OWN_TABLES: { key: string; table: string; orderBy: string }[] = [
  { key: "transactions", table: "transactions", orderBy: "id" },
  { key: "category_corrections", table: "category_rules", orderBy: "id" },
  { key: "budgets", table: "budgets", orderBy: "id" },
  { key: "goals", table: "goals", orderBy: "id" },
  { key: "goal_contributions", table: "goal_contributions", orderBy: "id" },
  { key: "savings_plans", table: "savings_plans", orderBy: "id" },
  { key: "savings_entries", table: "savings_entries", orderBy: "id" },
  { key: "alerts", table: "nudges", orderBy: "id" },
  { key: "streak_and_badges", table: "gamification", orderBy: "user_id" },
  { key: "learn_progress", table: "user_progress", orderBy: "module_id" },
  { key: "personalized_modules", table: "personalized_modules", orderBy: "id" },
  { key: "health_scores", table: "health_scores", orderBy: "id" },
  { key: "readiness_scores", table: "readiness_scores", orderBy: "id" },
  { key: "forecasts", table: "forecasts", orderBy: "id" },
  { key: "coach_history", table: "coach_messages", orderBy: "id" },
];

/**
 * Downloads everything the app holds about the caller as one JSON document: profile, payments,
 * budgets, goals, savings plans, alerts, streaks and badges, consents, coach history, corrections, scores and
 * forecasts, the list of registered passkey devices and their own activity log. Never the PIN
 * hash, passkey keys, other people's rows or server secrets. Writes one audit entry (counts only).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { client, user } = auth;

  if (!(await takeSlot(user.id, "export_slot", RATE_LIMIT, RATE_WINDOW_MINUTES))) {
    return json({ error: "rate_limited", retry_after_minutes: RATE_WINDOW_MINUTES }, 429);
  }

  /** All of the caller's rows in a table, a page at a time (the API returns at most 1000 rows). */
  async function readAll(table: string, orderBy: string, column = "user_id") {
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += PAGE) {
      let query = client.from(table).select("*").eq(column, user.id).order(orderBy);
      // rate-limit slots are bookkeeping, not the person's activity
      if (table === "audit_log") query = query.or("entity.is.null,entity.neq.limit");
      const { data, error } = await query.range(from, from + PAGE - 1);
      if (error) throw new Error(`${table}: ${error.message}`);
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) return rows;
    }
  }

  try {
    const profile = (await readAll("profiles", "id", "id"))[0] ?? {};
    const tables: Record<string, Record<string, unknown>[]> = {};
    for (const t of OWN_TABLES) tables[t.key] = await readAll(t.table, t.orderBy);
    const activity = await readAll("audit_log", "id");
    const { data: passkeys, error: passkeyError } = await client.rpc("list_passkeys");
    if (passkeyError) throw new Error(`passkeys: ${passkeyError.message}`);

    const rowCounts: Record<string, number> = {
      activity_log: activity.length,
      passkey_devices: (passkeys ?? []).length,
    };
    for (const [key, rows] of Object.entries(tables)) rowCounts[key] = rows.length;

    // Audit entry: what happened and how big, never the content.
    await adminClient()
      .from("audit_log")
      .insert({
        user_id: user.id,
        action: "export_data",
        entity: "account",
        detail: { rows: Object.values(rowCounts).reduce((a, b) => a + b, 0) },
      });

    return json({
      export: {
        format: "upay-compass-export-v1",
        generated_at: new Date().toISOString(),
        user_id: user.id,
        row_counts: rowCounts,
      },
      account: { phone: user.phone ?? null },
      profile,
      consents: {
        coach_consent_at: profile.coach_consent_at ?? null,
        voice_consent_at: profile.voice_consent_at ?? null,
      },
      ...tables,
      passkey_devices: passkeys ?? [],
      activity_log: activity,
    });
  } catch (e) {
    console.error("export failed:", e instanceof Error ? e.message : e);
    return json({ error: "export_failed" }, 500);
  }
});
