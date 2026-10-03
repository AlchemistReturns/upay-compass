import { adminClient } from "./http.ts";

/**
 * Takes one slot of a per-user rate limit, BEFORE the expensive call. The slot is written first and
 * then counted, so parallel requests cannot all slip under the limit the way a count-then-write
 * check lets them. A request that finds the limit already used gives its slot back, so being
 * refused does not lengthen the wait. Uses the service role because users cannot delete audit rows;
 * only call it after the caller has been verified. Returns true when the call may go ahead.
 */
export async function takeSlot(
  userId: string,
  action: string,
  limit: number,
  windowMinutes: number,
): Promise<boolean> {
  const admin = adminClient();
  const { data: slot, error } = await admin
    .from("audit_log")
    .insert({ user_id: userId, action, entity: "limit" })
    .select("id")
    .single();
  // if the slot cannot be written, refuse rather than run unmetered
  if (error || !slot) return false;
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const { count } = await admin
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action", action)
    .gte("created_at", since);
  if ((count ?? 0) > limit) {
    await admin.from("audit_log").delete().eq("id", slot.id);
    return false;
  }
  return true;
}
