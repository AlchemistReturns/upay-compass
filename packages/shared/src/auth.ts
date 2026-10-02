import { z } from "zod";

/** Bangladeshi mobile in E.164: +8801[3-9]XXXXXXXX */
export const BD_PHONE_REGEX = /^\+8801[3-9]\d{8}$/;

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

/**
 * Accepts 01XXXXXXXXX, 8801XXXXXXXXX or +8801XXXXXXXXX (spaces, dashes and Bangla
 * digits tolerated). Returns the E.164 form, or null if it is not a valid BD mobile.
 */
export function normalizeBdPhone(input: string): string | null {
  const ascii = input.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
  const digits = ascii.replace(/[\s\-()]/g, "");
  let e164: string;
  if (digits.startsWith("+880")) e164 = digits;
  else if (digits.startsWith("880")) e164 = `+${digits}`;
  else if (digits.startsWith("01")) e164 = `+88${digits}`;
  else return null;
  return BD_PHONE_REGEX.test(e164) ? e164 : null;
}

export const phoneSchema = z.string().transform((v, ctx) => {
  const phone = normalizeBdPhone(v);
  if (!phone) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid_phone" });
    return z.NEVER;
  }
  return phone;
});

export const otpSchema = z.string().regex(/^\d{6}$/, "invalid_otp");

export const pinSchema = z.string().regex(/^\d{4,6}$/, "invalid_pin");

export const MAX_PIN_ATTEMPTS = 5;
export const LOCK_AFTER_HIDDEN_MS = 2 * 60 * 1000;
