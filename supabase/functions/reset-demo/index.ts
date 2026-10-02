import { z } from "zod";
import { createDemoGoal } from "../_shared/demo.ts";
import { ingestForUser } from "../_shared/ingest.ts";
import { authenticate, corsHeaders, json } from "../_shared/http.ts";

const bodySchema = z.object({ persona: z.enum(["student", "gig", "salaried"]) });

/**
 * Starts the demo over for the caller: wipes their app data (reset_demo), loads the persona's
 * simulated history again and adds one savings goal. Only ever touches the caller's own rows.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { client, user } = auth;

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "invalid_body" }, 400);

  const reset = await client.rpc("reset_demo");
  if (reset.error) return json({ error: "reset_failed", detail: reset.error.message }, 500);

  const result = await ingestForUser(client, user.id, body.data.persona);
  if (!result.ok) return json({ error: result.error, detail: result.detail }, result.status);

  await createDemoGoal(client, user.id);
  return json({ ...result.summary, health_score: result.healthScore });
});
