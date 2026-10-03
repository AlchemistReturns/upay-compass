"use client";

import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import { useTranslation } from "react-i18next";
import { pinSchema } from "@compass/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "./auth-provider";
import { useLock } from "./lock-provider";

const digitsOnly = (v: string) => v.replace(/\D/g, "").slice(0, 6);

export function SetPinForm() {
  const { t } = useTranslation();
  const { setPin } = useLock();
  const [pin, setPinValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pinSchema.safeParse(pin).success) return setError(t("pin.invalid"));
    if (pin !== confirm) return setError(t("pin.mismatch"));
    setError(null);
    setBusy(true);
    try {
      await setPin(pin);
    } catch {
      setError(t("common.error"));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-muted-foreground text-sm">{t("pin.hint")}</p>
      <div className="space-y-2">
        <Label htmlFor="pin">{t("pin.new")}</Label>
        <Input
          id="pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={pin}
          onChange={(e) => setPinValue(digitsOnly(e.target.value))}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pin-confirm">{t("pin.confirm")}</Label>
        <Input
          id="pin-confirm"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(digitsOnly(e.target.value))}
        />
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? t("common.saving") : t("pin.save")}
      </Button>
    </form>
  );
}

export function LockScreen() {
  const { t } = useTranslation();
  const { unlock } = useLock();
  const { signOut } = useAuth();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await unlock(pin);
    setBusy(false);
    setPin("");
    if (result.ok) return;
    if (result.reason === "reset") setError(t("lock.signed_out"));
    else if (result.reason === "wrong") setError(t("lock.wrong", { count: result.attemptsLeft }));
    else setError(t("common.error"));
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8">
      <div className="finance-card p-6 sm:p-8">
        <span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-deep to-primary text-white shadow-[var(--shadow-raised)]">
          <LockKeyhole className="size-6" aria-hidden />
        </span>
        <h1 className="mb-6 text-center text-xl font-semibold">{t("lock.title")}</h1>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="lock-pin">{t("lock.enter")}</Label>
            <Input
              id="lock-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={pin}
              onChange={(e) => setPin(digitsOnly(e.target.value))}
              className="h-12 text-center text-lg tracking-[0.5em]"
            />
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy || pin.length < 4}>
            {t("lock.unlock")}
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => void signOut()}>
            {t("common.logout")}
          </Button>
        </form>
      </div>
    </div>
  );
}
