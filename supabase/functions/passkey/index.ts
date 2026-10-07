import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { adminClient, authenticate, corsHeaders, json } from "../_shared/http.ts";

/**
 * Passkey (WebAuthn) registration and sign-in for the app lock screen. Four steps, all POST
 * { action, ... }: register_options -> register_verify, auth_options -> auth_verify.
 * The challenge is stored server-side and used once, so a recorded response cannot be replayed.
 * Only the public key is kept. The browser's origin must be on PASSKEY_ORIGINS (comma separated,
 * default http://localhost:3000); the relying-party id is that origin's host name.
 */
const RP_NAME = "upay Compass";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_PASSKEYS = 5;

function allowedOrigin(req: Request): { origin: string; rpID: string } | null {
  const origins = (Deno.env.get("PASSKEY_ORIGINS") ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const origin = req.headers.get("Origin") ?? "";
  if (!origins.includes(origin)) return null;
  return { origin, rpID: new URL(origin).hostname };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { user } = auth;

  const where = allowedOrigin(req);
  if (!where) return json({ error: "origin_not_allowed" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const db = adminClient();

  /** Reads and deletes the pending challenge of the given kind (use once). */
  async function takeChallenge(kind: "register" | "authenticate"): Promise<string | null> {
    const { data } = await db
      .from("passkey_challenges")
      .select("challenge,kind,created_at")
      .eq("user_id", user.id)
      .maybeSingle();
    await db.from("passkey_challenges").delete().eq("user_id", user.id);
    if (!data || data.kind !== kind) return null;
    if (Date.now() - new Date(data.created_at as string).getTime() > CHALLENGE_TTL_MS) return null;
    return data.challenge as string;
  }
  async function saveChallenge(kind: "register" | "authenticate", challenge: string) {
    const { error } = await db
      .from("passkey_challenges")
      .upsert({ user_id: user.id, challenge, kind, created_at: new Date().toISOString() });
    if (error) throw error;
  }

  try {
    switch (body.action) {
      case "register_options": {
        const { data: existing } = await db
          .from("user_passkeys")
          .select("credential_id,transports")
          .eq("user_id", user.id);
        if ((existing?.length ?? 0) >= MAX_PASSKEYS) return json({ error: "too_many" }, 409);
        const options = await generateRegistrationOptions({
          rpName: RP_NAME,
          rpID: where.rpID,
          userName: user.phone ?? user.id,
          userID: new TextEncoder().encode(user.id),
          attestationType: "none",
          excludeCredentials: (existing ?? []).map((c) => ({
            id: c.credential_id as string,
            transports: c.transports as AuthenticatorTransportFuture[],
          })),
          // Fingerprint, face or screen lock on this device, always with user verification.
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            residentKey: "preferred",
            userVerification: "required",
          },
        });
        await saveChallenge("register", options.challenge);
        return json(options);
      }

      case "register_verify": {
        const challenge = await takeChallenge("register");
        if (!challenge) return json({ error: "challenge_expired" }, 400);
        const result = await verifyRegistrationResponse({
          response: body.response as RegistrationResponseJSON,
          expectedChallenge: challenge,
          expectedOrigin: where.origin,
          expectedRPID: where.rpID,
          requireUserVerification: true,
        });
        if (!result.verified || !result.registrationInfo)
          return json({ error: "not_verified" }, 400);
        const { credential } = result.registrationInfo;
        const name = typeof body.deviceName === "string" ? body.deviceName.slice(0, 60) : "";
        const { error } = await db.from("user_passkeys").insert({
          user_id: user.id,
          credential_id: credential.id,
          public_key: isoBase64URL.fromBuffer(credential.publicKey),
          counter: credential.counter,
          transports: credential.transports ?? [],
          device_name: name,
        });
        if (error) throw error;
        return json({ ok: true });
      }

      case "auth_options": {
        const { data: creds } = await db
          .from("user_passkeys")
          .select("credential_id,transports")
          .eq("user_id", user.id);
        if (!creds?.length) return json({ error: "no_passkey" }, 404);
        const options = await generateAuthenticationOptions({
          rpID: where.rpID,
          userVerification: "required",
          allowCredentials: creds.map((c) => ({
            id: c.credential_id as string,
            transports: c.transports as AuthenticatorTransportFuture[],
          })),
        });
        await saveChallenge("authenticate", options.challenge);
        return json(options);
      }

      case "auth_verify": {
        const challenge = await takeChallenge("authenticate");
        if (!challenge) return json({ error: "challenge_expired" }, 400);
        const response = body.response as AuthenticationResponseJSON;
        const { data: row } = await db
          .from("user_passkeys")
          .select("id,credential_id,public_key,counter,transports")
          .eq("user_id", user.id)
          .eq("credential_id", response?.id ?? "")
          .maybeSingle();
        if (!row) return json({ error: "unknown_credential" }, 400);
        const result = await verifyAuthenticationResponse({
          response,
          expectedChallenge: challenge,
          expectedOrigin: where.origin,
          expectedRPID: where.rpID,
          requireUserVerification: true,
          credential: {
            id: row.credential_id as string,
            publicKey: isoBase64URL.toBuffer(row.public_key as string),
            counter: Number(row.counter),
            transports: row.transports as AuthenticatorTransportFuture[],
          },
        });
        if (!result.verified) return json({ error: "not_verified" }, 400);
        await db
          .from("user_passkeys")
          .update({
            counter: result.authenticationInfo.newCounter,
            last_used_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        return json({ ok: true });
      }

      default:
        return json({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    return json(
      { error: "passkey_failed", detail: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});
