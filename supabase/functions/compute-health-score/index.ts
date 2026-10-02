import { authenticate, corsHeaders, json } from "../_shared/http.ts";
import { refreshHealthScore } from "../_shared/health.ts";

/**
 * Recomputes the caller's financial health score. The client calls it after budget changes and
 * when the score screen opens with a stale snapshot; ingest-transactions calls the same helper.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  try {
    const result = await refreshHealthScore(auth.client, auth.user.id);
    return json(result ?? { score: null, reason: "no_transactions" });
  } catch (e) {
    return json(
      { error: "compute_failed", detail: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});
