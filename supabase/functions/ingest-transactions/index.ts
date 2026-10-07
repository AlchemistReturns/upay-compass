import { FeedError, FEED_ERROR_STATUS } from "@compass/shared";
import { buildFeed, feedRequestSchema, upayApiConfigured } from "../_shared/feeds.ts";
import { ingestFromFeed } from "../_shared/ingest.ts";
import { authenticate, corsHeaders, json } from "../_shared/http.ts";

/**
 * Imports the caller's transactions from a source:
 *   { source: "simulated", persona }            demo history (also accepted as just { persona })
 *   { source: "statement_csv", csv, openingBalance? }   a statement the person exported
 *   { source: "upay_api" }                      upay's partner API, by the verified phone number
 *   { action: "sources" }                       which sources are available right now
 * Every source goes through the same pipeline (validate, categorize, insert once, refresh scores).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { client, user } = auth;

  const payload = await req.json().catch(() => null);
  if (
    payload &&
    typeof payload === "object" &&
    (payload as { action?: unknown }).action === "sources"
  ) {
    return json({ simulated: true, statement_csv: true, upay_api: upayApiConfigured() });
  }

  // Older clients send only { persona }; that means the simulated feed.
  const body = feedRequestSchema.safeParse(
    payload && typeof payload === "object" && !("source" in payload)
      ? { source: "simulated", ...payload }
      : payload,
  );
  if (!body.success) return json({ error: "invalid_body" }, 400);

  try {
    const feed = buildFeed(body.data);
    // Supabase stores the phone without the leading "+"; feeds expect E.164.
    const phone = user.phone ? (user.phone.startsWith("+") ? user.phone : `+${user.phone}`) : null;
    const meta = body.data.source === "simulated" ? { persona: body.data.persona } : {};
    const result = await ingestFromFeed(client, { userId: user.id, phone }, feed, meta);
    if (!result.ok) return json({ error: result.error, detail: result.detail }, result.status);
    return json({ ...result.summary, health_score: result.healthScore });
  } catch (e) {
    if (e instanceof FeedError) {
      return json({ error: e.code, detail: e.message }, FEED_ERROR_STATUS[e.code]);
    }
    return json(
      { error: "ingest_failed", detail: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});
