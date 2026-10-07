import { z } from "zod";
import { adminClient, authenticate, corsHeaders, json } from "../_shared/http.ts";
import { takeSlot } from "../_shared/limits.ts";

const bodySchema = z.object({
  /** the current app PIN: proof that the person at the keyboard is the account holder */
  pin: z.string().regex(/^\d{4,6}$/),
  /** must be literally true: the person agreed that this cannot be undone */
  confirm: z.literal(true),
});

/** At most this many attempts per person in this many minutes. */
const RATE_LIMIT = 5;
const RATE_WINDOW_MINUTES = 60;

/**
 * Deletes the caller's account and everything linked to it. Needs the current PIN (checked by
 * verify_pin, so its attempt limit and wait times apply) and `confirm: true`. Every table with a
 * user_id references auth.users with ON DELETE CASCADE, so deleting the auth user removes the
 * rows. audit_log is the one table kept (ON DELETE SET NULL) so the activity counts stay whole:
 * its detail is cleared first and the database nulls the user id. Finishes with one audit entry
 * that holds no personal data.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { client, user } = auth;

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "invalid_body" }, 400);

  if (!(await takeSlot(user.id, "delete_slot", RATE_LIMIT, RATE_WINDOW_MINUTES))) {
    return json({ error: "rate_limited", retry_after_minutes: RATE_WINDOW_MINUTES }, 429);
  }

  // Re-authentication: the PIN, through the same function the lock screen uses.
  const { data: check, error: pinError } = await client.rpc("verify_pin", { pin: body.data.pin });
  if (pinError) return json({ error: "reauth_failed" }, 500);
  if (!check?.ok) {
    return json(
      {
        error: "wrong_pin",
        attempts_left: check?.attempts_left ?? 0,
        locked_seconds: check?.locked_seconds ?? 0,
        reset: Boolean(check?.reset),
      },
      403,
    );
  }

  const admin = adminClient();

  const cleared = await admin.from("audit_log").update({ detail: null }).eq("user_id", user.id);
  if (cleared.error) return json({ error: "delete_failed" }, 500);

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("delete user failed:", deleteError.message);
    return json({ error: "delete_failed" }, 500);
  }

  // One entry, no user id and no content.
  await admin
    .from("audit_log")
    .insert({ user_id: null, action: "account_deleted", entity: "account" });
  return json({ deleted: true });
});
