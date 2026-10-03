"use client";

import { useState } from "react";
import { OTPField } from "@base-ui/react/otp-field";
import { ArrowLeft, ArrowRight, Loader2, Smartphone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { otpSchema, phoneSchema } from "@compass/shared";
import { supabase } from "@/lib/supabase";
import { writeUnlockFlag } from "@/lib/unlock-flag";
import { Button } from "@/components/ui/button";
import { FIELD } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const OTP_LENGTH = 6;

export function LoginForm() {
  const { t } = useTranslation();
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = phoneSchema.safeParse(phoneInput);
    if (!parsed.success) {
      setError(t("login.invalid_phone"));
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithOtp({ phone: parsed.data });
    setBusy(false);
    if (err) {
      setError(t("login.send_failed"));
      return;
    }
    setPhone(parsed.data);
  }

  async function verify(code: string) {
    setError(null);
    if (!phone || busy) return;
    if (!otpSchema.safeParse(code).success) {
      setError(t("login.invalid_otp"));
      return;
    }
    setBusy(true);
    // Proving the OTP counts as unlocking: set the flag first so the app does not ask for the
    // PIN straight after login (the session change fires before verifyOtp resolves).
    writeUnlockFlag(true);
    const { error: err } = await supabase.auth.verifyOtp({ phone, token: code, type: "sms" });
    setBusy(false);
    // On success the auth provider picks up the session and the page redirects.
    if (err) {
      writeUnlockFlag(false);
      setOtp("");
      setError(t("login.otp_failed"));
    }
  }

  if (!phone) {
    return (
      <form onSubmit={sendCode} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="phone">{t("login.phone_label")}</Label>
          <div className="relative">
            <Smartphone
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2"
              aria-hidden
            />
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder={t("login.phone_hint")}
              value={phoneInput}
              aria-invalid={error ? true : undefined}
              onChange={(e) => setPhoneInput(e.target.value)}
              className={cn(FIELD, "num h-14 pl-11 text-lg font-semibold tracking-wide md:text-lg")}
            />
          </div>
        </div>
        {error && (
          <p role="alert" className="text-destructive px-1 text-sm font-medium">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              {t("login.sending")}
            </>
          ) : (
            <>
              {t("login.send_code")}
              <ArrowRight aria-hidden />
            </>
          )}
        </Button>
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void verify(otp);
      }}
      className="fade-in space-y-5"
      noValidate
    >
      <p className="text-muted-foreground text-sm leading-6">{t("login.otp_sent", { phone })}</p>
      <div className="space-y-2.5">
        <Label htmlFor="otp">{t("login.otp_label")}</Label>
        <OTPField.Root
          id="otp"
          length={OTP_LENGTH}
          value={otp}
          onValueChange={(v) => setOtp(v)}
          onValueComplete={(v) => void verify(v)}
          disabled={busy}
          className="grid grid-cols-6 gap-2"
        >
          {Array.from({ length: OTP_LENGTH }, (_, i) => (
            <OTPField.Input
              key={i}
              autoFocus={i === 0}
              aria-label={i === 0 ? undefined : `${t("login.otp_label")} ${i + 1}/${OTP_LENGTH}`}
              className={cn(
                FIELD,
                "num h-14 rounded-xl px-0 text-center text-2xl font-extrabold md:text-2xl",
                error && "border-destructive/60",
              )}
            />
          ))}
        </OTPField.Root>
      </div>
      {error && (
        <p role="alert" className="text-destructive px-1 text-sm font-medium">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={busy || otp.length < OTP_LENGTH}>
        {busy ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            {t("login.verifying")}
          </>
        ) : (
          t("login.verify")
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-full"
        onClick={() => {
          setPhone(null);
          setOtp("");
          setError(null);
        }}
      >
        <ArrowLeft aria-hidden />
        {t("login.change_number")}
      </Button>
    </form>
  );
}
