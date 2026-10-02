import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, dhakaDay } from "@compass/shared";

/**
 * A savings goal with a little saved, so the demo account has something to show on the Goals
 * screen. `client` acts as the user (their JWT).
 */
export async function createDemoGoal(
  client: SupabaseClient,
  userId: string,
  opts: { title?: string; target?: number; saved?: number; days?: number } = {},
): Promise<string | null> {
  const target = opts.target ?? 6000;
  const { data, error } = await client
    .from("goals")
    .insert({
      user_id: userId,
      title: opts.title ?? "Phone fund",
      target_amount: target,
      target_date: addDays(dhakaDay(new Date()), opts.days ?? 90),
    })
    .select("id")
    .single();
  if (error || !data) return null;
  const saved = opts.saved ?? 1500;
  if (saved > 0) await client.rpc("contribute_to_goal", { p_goal_id: data.id, p_amount: saved });
  return data.id as string;
}
