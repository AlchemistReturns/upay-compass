import { beforeAll, describe, expect, it } from "vitest";
import { anon, signIn, url, type TestUser } from "./integration-utils";

type State = { streak_days: number; badges: { id: string }[]; new_badges: string[] };

/** Learn hub and gamification: state changes only through the RPCs. Needs a running Supabase stack. */
describe.skipIf(!url || !anon)("phase 5: learn modules, progress, streaks, badges", () => {
  let a: TestUser;
  let b: TestUser;

  beforeAll(async () => {
    a = await signIn("+8801700000002");
    b = await signIn("+8801700000003");
  });

  it("modules are readable by signed-in users, in both languages, and not writable", async () => {
    const { data, error } = await a.client
      .from("learn_modules")
      .select("slug,title_en,title_bn,body_md_en,body_md_bn")
      .order("position");
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(8);
    for (const m of data!) {
      expect(m.title_en && m.title_bn && m.body_md_en && m.body_md_bn).toBeTruthy();
    }
    const upd = await a.client
      .from("learn_modules")
      .update({ title_en: "x" })
      .eq("slug", data![0]!.slug)
      .select();
    expect(upd.data ?? []).toEqual([]);
  });

  it("progress and gamification cannot be written directly", async () => {
    const mod = await a.client.from("learn_modules").select("id").limit(1).single();
    const p = await a.client
      .from("user_progress")
      .insert({ user_id: a.id, module_id: mod.data!.id });
    expect(p.error).not.toBeNull();
    const g = await a.client
      .from("gamification")
      .insert({ user_id: a.id, streak_days: 99, badges: [] });
    expect(g.error).not.toBeNull();
    const g2 = await a.client.from("gamification").update({ streak_days: 99 }).eq("user_id", a.id);
    expect(g2.error).not.toBeNull();
  });

  it("touch_activity counts a day once, however often the app is opened", async () => {
    const first = await a.client.rpc("touch_activity");
    expect(first.error).toBeNull();
    const s1 = first.data as State;
    expect(s1.streak_days).toBeGreaterThanOrEqual(1);
    const second = (await a.client.rpc("touch_activity")).data as State;
    expect(second.streak_days).toBe(s1.streak_days);
    expect(second.new_badges).toEqual([]);
  });

  it("completing every module is idempotent and awards Module Graduate once", async () => {
    const slugs = (await a.client.from("learn_modules").select("slug")).data!.map((m) => m.slug);
    let awarded = 0;
    for (const slug of slugs) {
      const r = await a.client.rpc("complete_module", { p_slug: slug });
      expect(r.error).toBeNull();
      if ((r.data as State).new_badges.includes("module_graduate")) awarded++;
    }
    const again = (await a.client.rpc("complete_module", { p_slug: slugs[0] })).data as State;
    expect(again.new_badges).toEqual([]);
    expect(awarded).toBeLessThanOrEqual(1);
    expect(again.badges.map((x) => x.id)).toContain("module_graduate");
    const progress = await a.client.from("user_progress").select("module_id");
    expect(progress.data!.length).toBe(slugs.length);
  });

  it("an unknown module is rejected", async () => {
    const r = await a.client.rpc("complete_module", { p_slug: "no-such-module" });
    expect(r.error).not.toBeNull();
  });

  it("creating a goal earns First Goal on the next check, and only for its owner", async () => {
    const goal = await b.client
      .from("goals")
      .insert({ user_id: b.id, title: "Test goal (phase 5)", target_amount: 1000 })
      .select("id")
      .single();
    expect(goal.error).toBeNull();
    const state = (await b.client.rpc("touch_activity")).data as State;
    expect(state.badges.map((x) => x.id)).toContain("first_goal");
    await b.client.from("goals").delete().eq("id", goal.data!.id);
    const seen = await b.client.from("user_progress").select("module_id").eq("user_id", a.id);
    expect(seen.data).toEqual([]);
  });

  it("the badge helper functions are not callable from the client", async () => {
    const r = await a.client.rpc("award_badges", { p_user: a.id });
    expect(r.error).not.toBeNull();
  });
});
