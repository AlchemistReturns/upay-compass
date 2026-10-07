import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { anon, signIn, url, type TestUser } from "./integration-utils";

/**
 * Data export and account deletion, with real local test users. Needs the local stack with the
 * functions served and the service key (all three variables), because it seeds and checks tables
 * that clients cannot reach:
 *   RLS_TEST_URL=http://127.0.0.1:54321 RLS_TEST_ANON_KEY=<anon> RLS_TEST_SERVICE_KEY=<service_role> \
 *     pnpm --filter @compass/shared test
 */
const service = process.env.RLS_TEST_SERVICE_KEY;

// Every table that has a user_id column (profiles is keyed by id).
const USER_TABLES = [
  "audit_log",
  "budgets",
  "category_rules",
  "coach_messages",
  "forecasts",
  "gamification",
  "goal_contributions",
  "goals",
  "health_scores",
  "nudges",
  "passkey_challenges",
  "personalized_modules",
  "readiness_scores",
  "savings_entries",
  "transactions",
  "user_passkeys",
  "user_pins",
  "user_progress",
];

describe.skipIf(!url || !anon || !service)("export and account deletion", () => {
  const admin = () => createClient(url!, service!, { auth: { persistSession: false } });
  let a: TestUser; // exports their data
  let b: TestUser; // another person whose rows must stay out of the export
  let victim: TestUser; // is deleted

  async function call(fn: string, user: TestUser | null, body: unknown = {}) {
    const token = user ? (await user.client.auth.getSession()).data.session!.access_token : "x";
    return fetch(`${url}/functions/v1/${fn}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  // These functions are rate limited per hour, so a rerun starts from a clean slate.
  async function resetLimits(ids: string[]) {
    await admin().from("audit_log").delete().in("user_id", ids).eq("entity", "limit");
  }

  beforeAll(async () => {
    a = await signIn("+8801700000001");
    b = await signIn("+8801700000002");
    victim = await signIn("+8801700000005");
    await resetLimits([a.id, b.id, victim.id]);
  });

  describe("export-my-data", () => {
    it("is rejected without a valid session", async () => {
      expect((await call("export-my-data", null)).status).toBe(401);
      const noHeader = await fetch(`${url}/functions/v1/export-my-data`, { method: "POST" });
      expect(noHeader.status).toBe(401);
    });

    it("returns only the caller's rows and never the PIN hash", async () => {
      await admin().from("user_pins").delete().eq("user_id", a.id);
      expect((await a.client.rpc("set_pin", { new_pin: "4321" })).error).toBeNull();
      const { data: pinRow } = await admin()
        .from("user_pins")
        .select("pin_hash")
        .eq("user_id", a.id)
        .single();

      const mine = await a.client
        .from("goals")
        .insert({ user_id: a.id, title: "export-mine", target_amount: 100 })
        .select("id")
        .single();
      const theirs = await b.client
        .from("goals")
        .insert({ user_id: b.id, title: "export-theirs", target_amount: 100 })
        .select("id")
        .single();
      expect(mine.error).toBeNull();
      expect(theirs.error).toBeNull();

      const res = await call("export-my-data", a);
      expect(res.status).toBe(200);
      const text = await res.text();
      const doc = JSON.parse(text);

      expect(doc.export.user_id).toBe(a.id);
      expect(doc.profile.id).toBe(a.id);
      expect(doc.goals.map((g: { title: string }) => g.title)).toContain("export-mine");
      expect(text).not.toContain("export-theirs");
      expect(text).not.toContain(b.id);
      expect(text).not.toContain("pin_hash");
      expect(text).not.toContain(pinRow!.pin_hash);
      for (const key of ["user_pins", "user_passkeys", "passkey_challenges", "model_events"]) {
        expect(doc).not.toHaveProperty(key);
      }
      // every row in every exported section belongs to the caller
      for (const section of ["transactions", "budgets", "goals", "alerts", "coach_history"]) {
        for (const row of doc[section] as { user_id: string }[]) expect(row.user_id).toBe(a.id);
      }

      await a.client.from("goals").delete().eq("id", mine.data!.id);
      await b.client.from("goals").delete().eq("id", theirs.data!.id);
    });

    it("writes an audit entry with counts only", async () => {
      const { data } = await admin()
        .from("audit_log")
        .select("detail")
        .eq("user_id", a.id)
        .eq("action", "export_data")
        .order("id", { ascending: false })
        .limit(1)
        .single();
      expect(Object.keys(data!.detail as object)).toEqual(["rows"]);
    });
  });

  describe("delete-account", () => {
    beforeAll(async () => {
      await admin().from("user_pins").delete().eq("user_id", victim.id);
      expect((await victim.client.rpc("set_pin", { new_pin: "2468" })).error).toBeNull();
    });

    it("is rejected without a valid session", async () => {
      const res = await call("delete-account", null, { pin: "2468", confirm: true });
      expect(res.status).toBe(401);
    });

    it("fails without the confirmation flag", async () => {
      expect((await call("delete-account", victim, { pin: "2468" })).status).toBe(400);
      expect((await call("delete-account", victim, { pin: "2468", confirm: false })).status).toBe(
        400,
      );
    });

    it("fails without re-authentication, and with a wrong PIN", async () => {
      expect((await call("delete-account", victim, { confirm: true })).status).toBe(400);
      const wrong = await call("delete-account", victim, { pin: "1111", confirm: true });
      expect(wrong.status).toBe(403);
      const { data } = await admin().from("profiles").select("id").eq("id", victim.id);
      expect(data).toHaveLength(1);
    });

    it("removes every row of the caller and leaves other people untouched", async () => {
      await admin().from("user_pins").delete().eq("user_id", victim.id);
      await victim.client.rpc("set_pin", { new_pin: "2468" });
      await resetLimits([victim.id]);

      // data in the tables people write to, and the ones only the server writes
      const own = (rows: object) => ({ user_id: victim.id, ...rows });
      await victim.client.from("goals").insert(own({ title: "g", target_amount: 100 }));
      await victim.client.from("budgets").insert(own({ category_id: 1, limit_amount: 500 }));
      await victim.client.from("transactions").insert(
        own({
          amount: 50,
          direction: "out",
          channel: "merchant",
          counterparty: "Shop",
          occurred_at: new Date().toISOString(),
        }),
      );
      await victim.client.from("category_rules").insert(own({ keyword: "shop", category_id: 1 }));
      const db = admin();
      // the admin role must not get in the way of deletion
      await db.from("profiles").update({ role: "admin" }).eq("id", victim.id);
      await db.from("coach_messages").insert(own({ role: "user", content: "hello" }));
      await db.from("gamification").upsert(own({ streak_days: 3 }));
      await db.from("health_scores").insert(own({ score: 50, breakdown: {} }));
      await db.from("readiness_scores").insert(own({ score: 50, breakdown: {} }));
      await db.from("forecasts").insert(own({ horizon_days: 30, projected_balance: [] }));
      await db.from("savings_entries").insert(own({ kind: "deposit", amount: 10 }));
      await db
        .from("user_passkeys")
        .insert(own({ credential_id: `cred-${victim.id}`, public_key: "k" }));
      await db.from("passkey_challenges").upsert(own({ challenge: "c", kind: "register" }));
      const goal = await victim.client.from("goals").select("id").limit(1).single();
      await db
        .from("goal_contributions")
        .insert(own({ goal_id: goal.data!.id, amount: 5, source: "manual" }));
      await db.from("nudges").insert(own({ type: "test", dedupe_key: "t" }));
      const module = await db.from("learn_modules").select("id").limit(1).single();
      await db.from("user_progress").insert(own({ module_id: module.data!.id }));
      await db.from("personalized_modules").insert(
        own({
          topic_id: "t",
          language: "en",
          content: {},
          facts: {},
          reason_id: "r",
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      );
      const note = await db
        .from("audit_log")
        .insert(own({ action: "test_note", entity: "test", detail: { secret: "x" } }))
        .select("id")
        .single();
      const otherGoals = await b.client.from("goals").select("id");

      // the seeds really landed, so "nothing left" below means something
      for (const table of USER_TABLES) {
        const { count } = await db
          .from(table)
          .select("*", { count: "exact", head: true })
          .eq("user_id", victim.id);
        expect(count, `seed in ${table}`).toBeGreaterThan(0);
      }

      const res = await call("delete-account", victim, { pin: "2468", confirm: true });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ deleted: true });

      for (const table of USER_TABLES) {
        const { data, error } = await db.from(table).select("*").eq("user_id", victim.id);
        expect(error, table).toBeNull();
        expect(data, table).toEqual([]);
      }
      expect((await db.from("profiles").select("id").eq("id", victim.id)).data).toEqual([]);
      expect((await db.auth.admin.getUserById(victim.id)).data.user).toBeNull();

      // the audit row is kept, anonymised; the deletion itself is logged without any user id
      const kept = await db.from("audit_log").select("user_id,detail").eq("id", note.data!.id);
      expect(kept.data).toEqual([{ user_id: null, detail: null }]);
      const logged = await db
        .from("audit_log")
        .select("user_id,detail,entity_id")
        .eq("action", "account_deleted")
        .order("id", { ascending: false })
        .limit(1);
      expect(logged.data).toEqual([{ user_id: null, detail: null, entity_id: null }]);

      // the signed-in token of the deleted person no longer works
      expect((await call("export-my-data", victim)).status).toBe(401);

      // the group figures still compute without them
      expect((await b.client.rpc("community_insights")).error).toBeNull();

      // another person's data is untouched
      expect((await b.client.from("goals").select("id")).data).toEqual(otherGoals.data);
      expect((await b.client.from("profiles").select("id")).data).toEqual([{ id: b.id }]);
    });
  });

  describe("categorize-transaction without consent", () => {
    it("sends nothing to the model: the payment is filed under Other and marked to check", async () => {
      const db = admin();
      await db.from("profiles").update({ coach_consent_at: null }).eq("id", b.id);
      await resetLimits([b.id]);
      const eventCount = async () =>
        (
          await db
            .from("model_events")
            .select("*", { count: "exact", head: true })
            .eq("function_name", "categorize-transaction")
        ).count ?? 0;
      const before = await eventCount();

      const tx = await b.client
        .from("transactions")
        .insert({
          user_id: b.id,
          amount: 120,
          direction: "out",
          channel: "merchant",
          counterparty: "Zzqx Qwvb Holdings",
          occurred_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      expect(tx.error).toBeNull();

      const res = await call("categorize-transaction", b, { transaction_ids: [tx.data!.id] });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ai_labelled: 0 });

      const row = await b.client
        .from("transactions")
        .select("needs_review,category_source,categories(key)")
        .eq("id", tx.data!.id)
        .single();
      expect(row.data).toMatchObject({
        needs_review: true,
        category_source: "rule",
        categories: { key: "other" },
      });

      // a model call writes a monitoring event; wait for the detached write, then expect none
      await new Promise((r) => setTimeout(r, 1500));
      expect(await eventCount()).toBe(before);

      await b.client.from("transactions").delete().eq("id", tx.data!.id);
    });
  });
});
