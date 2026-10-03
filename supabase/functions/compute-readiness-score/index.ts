import { authenticate, corsHeaders, json } from "../_shared/http.ts";
import { refreshReadiness } from "../_shared/readiness.ts";

/**
 * Recomputes the caller's credit readiness (informational only; never a lending decision).
 * The client calls it when the readiness screen opens with a stale snapshot; ingest-transactions
 * calls the same helper.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  try {
    const result = await refreshReadiness(auth.client, auth.user.id);
    return json(result ?? { score: null, reason: "no_transactions" });
  } catch (e) {
    return json(
      { error: "compute_failed", detail: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});
