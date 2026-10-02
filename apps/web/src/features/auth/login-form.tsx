"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { otpSchema, phoneSchema } from "@compass/shared";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!phone) return;
    if (!otpSchema.safeParse(otp).success) {
      setError(t("login.invalid_otp"));
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.verifyOtp({ phone, token: otp, type: "sms" });
    setBusy(false);
    // On success the auth provider picks up the session and the page redirects.
    if (err) setError(t("login.otp_failed"));
  }

  if (!phone) {
    return (
      <form onSubmit={sendCode} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="phone">{t("login.phone_label")}</Label>
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={t("login.phone_hint")}
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? t("login.sending") : t("login.send_code")}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-4" noValidate>
      <p className="text-muted-foreground text-sm">{t("login.otp_sent", { phone })}</p>
      <div className="space-y-2">
        <Label htmlFor="otp">{t("login.otp_label")}</Label>
        <Input
          id="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
        />
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? t("login.verifying") : t("login.verify")}
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
        {t("login.change_number")}
      </Button>
    </form>
  );
}
