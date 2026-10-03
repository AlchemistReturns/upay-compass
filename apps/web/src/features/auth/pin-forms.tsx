"use client";

import { useState } from "react";
import { Loader2, LockKeyhole } from "lucide-react";
import { useTranslation } from "react-i18next";
import { pinSchema } from "@compass/shared";
import { BrandMark } from "@/components/compass";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAuth } from "./auth-provider";
import { useLock } from "./lock-provider";

const PIN_MAX = 6;
const digitsOnly = (v: string) => v.replace(/\D/g, "").slice(0, PIN_MAX);

/**
 * A real password input (so keyboards, autofill and screen readers behave) laid over six dots
 * that fill as digits are typed. 4 to 6 digits are allowed, so the last two dots are optional.
 */
function PinField({
  id,
  value,
  onChange,
  autoFocus,
  autoComplete = "off",
  dark = false,
  invalid = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  autoComplete?: string;
  dark?: boolean;
  invalid?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex h-16 items-center justify-center gap-3.5 rounded-2xl border transition-[border-color,box-shadow,background-color] duration-150",
        dark
          ? "border-white/15 bg-white/8 has-[input:focus-visible]:border-white/40 has-[input:focus-visible]:ring-4 has-[input:focus-visible]:ring-white/10"
          : "border-input bg-field has-[input:focus-visible]:border-primary/60 has-[input:focus-visible]:bg-card has-[input:focus-visible]:ring-4 has-[input:focus-visible]:ring-ring/20",
        invalid && "animate-[shake_.4s_ease] border-destructive/60",
      )}
    >
      {Array.from({ length: PIN_MAX }, (_, i) => {
        const filled = i < value.length;
        const optional = i >= 4;
        return (
          <span
            key={i}
            aria-hidden
            className={cn(
              "size-3.5 rounded-full transition-[transform,background-color,box-shadow] duration-200",
              filled
                ? cn("scale-110", dark ? "bg-lime" : "bg-primary")
                : cn(
                    "ring-[1.5px] ring-inset",
                    dark ? "ring-white/35" : "ring-foreground/25",
                    optional && "opacity-50",
                  ),
            )}
          />
        );
      })}
      <input
        id={id}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        maxLength={PIN_MAX}
        value={value}
        onChange={(e) => onChange(digitsOnly(e.target.value))}
        className="absolute inset-0 h-full w-full cursor-text rounded-2xl bg-transparent text-transparent caret-transparent opacity-0 outline-none"
      />
    </div>
  );
}

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
    <form onSubmit={submit} className="space-y-5" noValidate>
      <p className="text-muted-foreground text-sm leading-6">{t("pin.hint")}</p>
      <div className="space-y-2">
        <Label htmlFor="pin">{t("pin.new")}</Label>
        <PinField
          id="pin"
          value={pin}
          onChange={setPinValue}
          autoComplete="new-password"
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pin-confirm">{t("pin.confirm")}</Label>
        <PinField
          id="pin-confirm"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          invalid={error === t("pin.mismatch")}
        />
      </div>
      {error && (
        <p role="alert" className="text-destructive px-1 text-sm font-medium">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={busy || pin.length < 4}>
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
  const [attempt, setAttempt] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await unlock(pin);
    setBusy(false);
    setPin("");
    if (result.ok) return;
    setAttempt((n) => n + 1);
    if (result.reason === "reset") setError(t("lock.signed_out"));
    else if (result.reason === "wrong") setError(t("lock.wrong", { count: result.attemptsLeft }));
    else setError(t("common.error"));
  }

  return (
    <div className="auth-showcase flex min-h-dvh w-full flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="rise w-full max-w-sm text-center">
        <div className="relative mx-auto mb-6 w-fit">
          <BrandMark className="brand-intro size-16 shadow-[0_14px_30px_-12px_rgba(0,0,0,.6)]" />
          <span className="bg-lime text-brand-ink absolute -right-2 -bottom-2 grid size-8 place-items-center rounded-full ring-4 ring-[#0a3f41]">
            <LockKeyhole className="size-4" aria-hidden />
          </span>
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight">{t("lock.title")}</h1>
        <form onSubmit={submit} className="mt-7 space-y-4 text-left" noValidate>
          <label
            htmlFor="lock-pin"
            className="text-on-dark-muted block text-center text-sm font-semibold"
          >
            {t("lock.enter")}
          </label>
          <PinField
            key={attempt}
            id="lock-pin"
            value={pin}
            onChange={setPin}
            autoFocus
            dark
            invalid={attempt > 0 && Boolean(error)}
          />
          {error && (
            <p role="alert" className="text-center text-sm font-semibold text-[#ffb59e]">
              {error}
            </p>
          )}
          <Button
            type="submit"
            variant="lime"
            size="lg"
            className="w-full"
            disabled={busy || pin.length < 4}
          >
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {t("lock.unlock")}
          </Button>
          <Button
            type="button"
            variant="darkGhost"
            className="w-full"
            onClick={() => void signOut()}
          >
            {t("common.logout")}
          </Button>
        </form>
      </div>
    </div>
  );
}
