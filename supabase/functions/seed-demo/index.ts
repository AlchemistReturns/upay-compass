import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { IncomeType } from "@compass/shared";
import { createDemoGoal } from "../_shared/demo.ts";
import { ingestForUser } from "../_shared/ingest.ts";
import { adminClient, authenticate, corsHeaders, json } from "../_shared/http.ts";

/**
 * Admin only. Creates (or refreshes) a small cohort of synthetic demo people so the admin insights
 * have enough people to show: 5 per persona, each with their own simulated history, a goal at a
 * different stage, a budget, some round-ups and some learning progress. The accounts are
 * clearly synthetic (phones +88019900000NN) and sign in with a throwaway password nobody keeps.
 */
const PERSONAS: IncomeType[] = ["student", "gig", "salaried"];
const PER_PERSONA = 5; // matches the minimum group size, so per-persona figures are shown
const GOAL_TARGETS = [4000, 8000, 12000, 6000, 10000];
const GOAL_SHARE = [1, 0.5, 0.2, 0.8, 0.35];
const MODULES_DONE = [Infinity, 4, 1, 6, 2]; // modules finished per person
const MONTHLY_INCOME: Record<IncomeType, number> = { student: 8000, gig: 25000, salaried: 40000 };

async function findUserId(admin: SupabaseClient, phone: string): Promise<string | null> {
  const digits = phone.replace("+", "");
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data) return null;
    const hit = data.users.find((u) => u.phone === digits);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { client, user } = auth;

  const { data: me } = await client.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return json({ error: "forbidden" }, 403);

  const admin = adminClient();
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const { data: food } = await admin.from("categories").select("id").eq("key", "food").single();
  const { data: modules } = await admin.from("learn_modules").select("slug").order("position");

  let n = 0;
  const created: string[] = [];
  for (const persona of PERSONAS) {
    for (let j = 0; j < PER_PERSONA; j++) {
      n++;
      const phone = `+88019900000${String(n).padStart(2, "0")}`;
      const password = crypto.randomUUID();

      let userId = await findUserId(admin, phone);
      if (userId) {
        await admin.auth.admin.updateUserById(userId, { password });
      } else {
        const made = await admin.auth.admin.createUser({ phone, password, phone_confirm: true });
        if (made.error || !made.data.user) return json({ error: "create_failed", phone }, 500);
        userId = made.data.user.id;
      }

      await admin
        .from("profiles")
        .update({
          full_name: `Demo ${persona} ${j + 1}`,
          language: n % 2 ? "bn" : "en",
          income_type: persona,
          monthly_income: MONTHLY_INCOME[persona],
          onboarded: true,
        })
        .eq("id", userId);

      // Act as that person, so every row goes through the same rules as a real user's.
      const person = createClient(url, anonKey, { auth: { persistSession: false } });
      const signedIn = await person.auth.signInWithPassword({ phone, password });
      if (signedIn.error) return json({ error: "sign_in_failed", phone }, 500);

      await person.rpc("reset_demo");
      const ingest = await ingestForUser(person, userId, persona, `cohort-${n}`);
      if (!ingest.ok) return json({ error: ingest.error, detail: ingest.detail }, ingest.status);

      const goalId = await createDemoGoal(person, userId, {
        title: "Savings goal",
        target: GOAL_TARGETS[j],
        saved: Math.round(GOAL_TARGETS[j] * GOAL_SHARE[j]),
      });
      if (food) {
        await person
          .from("budgets")
          .insert({ user_id: userId, category_id: food.id, limit_amount: 4000 });
      }
      if (goalId && j >= 1) {
        // (the first goal in each group is already complete, so round-ups go to the others)
        await person.rpc("set_roundup", { p_enabled: true, p_goal_id: goalId });
        // A few payments with odd amounts, so round-ups actually collect something.
        const today = new Date().toISOString();
        await person.from("transactions").insert(
          [47, 123, 89, 211, 36, 154].map((amount, i) => ({
            user_id: userId,
            external_id: `cohort-roundup-${n}-${i}`,
            amount,
            direction: "out",
            channel: "merchant",
            counterparty: "Local shop",
            category_id: food?.id,
            category_source: "rule",
            is_simulated: true,
            occurred_at: today,
          })),
        );
      }
      for (const m of (modules ?? []).slice(0, MODULES_DONE[j])) {
        await person.rpc("complete_module", { p_slug: m.slug });
      }
      await person.rpc("touch_activity");
      created.push(phone);
    }
  }

  await client.from("audit_log").insert({
    user_id: user.id,
    action: "seed_demo_cohort",
    entity: "profiles",
    detail: { people: created.length },
  });
  return json({ people: created.length });
});
