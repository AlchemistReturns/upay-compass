import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Shared setup for tests that need a running Supabase stack (local or cloud). */
export const url = process.env.RLS_TEST_URL;
export const anon = process.env.RLS_TEST_ANON_KEY;

export type TestUser = { client: SupabaseClient; id: string };

export async function signIn(phone: string): Promise<TestUser> {
  const client = createClient(url!, anon!, { auth: { persistSession: false } });
  let sent = await client.auth.signInWithOtp({ phone });
  if (sent.error?.status === 429 || sent.error?.message.includes("only request this after")) {
    // OTP resend limit (local: 5s per number); wait it out once.
    await new Promise((r) => setTimeout(r, 5500));
    sent = await client.auth.signInWithOtp({ phone });
  }
  if (sent.error) throw sent.error;
  const { data, error } = await client.auth.verifyOtp({ phone, token: "123456", type: "sms" });
  if (error || !data.user) throw error ?? new Error("no user");
  return { client, id: data.user.id };
}
