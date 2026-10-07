import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { supabase } from "@/lib/supabase";

export type PasskeyResult = "ok" | "cancelled" | "error";

/** True when this browser and device can unlock with fingerprint, face or screen lock. */
export async function passkeySupported(): Promise<boolean> {
  try {
    return browserSupportsWebAuthn() && (await platformAuthenticatorIsAvailable());
  } catch {
    return false;
  }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("passkey", { body });
  if (error) throw error;
  return data as T;
}

/** Closing the system prompt is not an error worth showing. */
const wasCancelled = (e: unknown) =>
  e instanceof Error && (e.name === "NotAllowedError" || e.name === "AbortError");

export async function registerPasskey(deviceName: string): Promise<PasskeyResult> {
  try {
    const optionsJSON = await call<PublicKeyCredentialCreationOptionsJSON>({
      action: "register_options",
    });
    const response = await startRegistration({ optionsJSON });
    await call({ action: "register_verify", response, deviceName });
    return "ok";
  } catch (e) {
    return wasCancelled(e) ? "cancelled" : "error";
  }
}

export async function authenticateWithPasskey(): Promise<PasskeyResult> {
  try {
    const optionsJSON = await call<PublicKeyCredentialRequestOptionsJSON>({
      action: "auth_options",
    });
    const response = await startAuthentication({ optionsJSON });
    await call({ action: "auth_verify", response });
    return "ok";
  } catch (e) {
    return wasCancelled(e) ? "cancelled" : "error";
  }
}
