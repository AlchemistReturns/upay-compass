import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { BUFFER_FACTS, GOOD_BUFFER_EN } from "./learn-fixtures";
import { toStoredContent } from "./learn-module";
import { anon, signIn, url, type TestUser } from "./integration-utils";

/**
 * Personalized learn modules (Phase 12): users read their own rows and change only their progress,
 * through update_personalized_module(). Needs a running Supabase stack. The tests that need a stored
 * row also need RLS_TEST_SERVICE_KEY (only the server may insert rows).
 */
const service = process.env.RLS_TEST_SERVICE_KEY;

describe.skipIf(!url || !anon)("phase 12: personalized learn modules", () => {
  let a: TestUser;
  let b: TestUser;
  let rowId: string | null = null;

  beforeAll(async () => {
    a = await signIn("+8801700000002");
    b = await signIn("+8801700000003");
    if (service) {
      const admin = createClient(url!, service, { auth: { persistSession: false } });
      const { data, error } = await admin
        .from("personalized_modules")
        .upsert(
          {
            user_id: a.id,
            topic_id: "buffer_in_days",
            language: "en",
            content: toStoredContent(GOOD_BUFFER_EN, "en"),
            facts: BUFFER_FACTS,
            reason_id: "buffer_thin",
            expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
            completed_at: null,
            quick_check_score: null,
            feedback: null,
            dismissed_at: null,
          },
          { onConflict: "user_id,topic_id,language" },
        )
        .select("id")
        .single();
      if (error) throw error;
      rowId = data.id as string;
    }
  });

  it("a user cannot insert a module, even for themselves", async () => {
    const { error } = await a.client.from("personalized_modules").insert({
      user_id: a.id,
      topic_id: "scam_safety",
      language: "en",
      content: {},
      facts: {},
      reason_id: "unusual_payment",
      expires_at: new Date().toISOString(),
    });
    expect(error).not.toBeNull();
  });

  it("the update function refuses an id that is not the caller's", async () => {
    const { error } = await a.client.rpc("update_personalized_module", {
      p_id: "00000000-0000-0000-0000-000000000000",
      p_completed: true,
    });
    expect(error?.message).toMatch(/unknown module/);
  });

  it.skipIf(!service)("the owner reads the row; another user sees nothing", async () => {
    const own = await a.client.from("personalized_modules").select("id").eq("id", rowId!);
    expect(own.data).toHaveLength(1);
    const other = await b.client.from("personalized_modules").select("id").eq("id", rowId!);
    expect(other.data ?? []).toEqual([]);
  });

  it.skipIf(!service)("content and facts cannot be changed from the browser", async () => {
    const upd = await a.client
      .from("personalized_modules")
      .update({ content: { title: "hacked" }, facts: { buffer_days: 999 } })
      .eq("id", rowId!)
      .select();
    expect(upd.error ?? upd.data?.length === 0).toBeTruthy();
    const row = await a.client
      .from("personalized_modules")
      .select("content,facts")
      .eq("id", rowId!)
      .single();
    expect((row.data!.content as { title: string }).title).toBe(GOOD_BUFFER_EN.title);
    expect(row.data!.facts).toEqual(BUFFER_FACTS);
  });

  it.skipIf(!service)("another user cannot change the owner's progress", async () => {
    const { error } = await b.client.rpc("update_personalized_module", {
      p_id: rowId!,
      p_dismissed: true,
    });
    expect(error?.message).toMatch(/unknown module/);
  });

  it.skipIf(!service)("the owner changes progress fields only, within range", async () => {
    const before = (await a.client.from("user_progress").select("module_id")).data!.length;
    const done = await a.client.rpc("update_personalized_module", {
      p_id: rowId!,
      p_completed: true,
      p_quick_check_score: 2,
      p_feedback: 1,
    });
    expect(done.error).toBeNull();
    expect(done.data).toMatchObject({ quick_check_score: 2, feedback: 1, dismissed_at: null });
    expect(done.data.completed_at).not.toBeNull();
    // more right answers than questions is refused
    const tooMany = await a.client.rpc("update_personalized_module", {
      p_id: rowId!,
      p_quick_check_score: 3,
    });
    expect(tooMany.error?.message).toMatch(/invalid score/);
    // finishing a personalized module does not count toward the 8 course modules
    const after = (await a.client.from("user_progress").select("module_id")).data!.length;
    expect(after).toBe(before);
  });
});
