import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Builds a Supabase client that acts as the caller (their JWT, so RLS applies) and verifies the
 * token. Functions run with `verify_jwt = false` and check the user here instead, which also works
 * with asymmetric (ES256) project JWTs. Returns a Response to send back when auth fails.
 */
export async function authenticate(
  req: Request,
): Promise<{ client: SupabaseClient; user: User } | Response> {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser(authorization.slice("Bearer ".length));
  if (error || !data.user) return json({ error: "unauthorized" }, 401);
  return { client, user: data.user };
}
