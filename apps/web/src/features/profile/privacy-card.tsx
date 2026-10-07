"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Download, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/toaster";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-provider";
import { useOnline } from "@/features/pwa/use-online";

type FunctionError = {
  error?: string;
  attempts_left?: number;
  locked_seconds?: number;
  reset?: boolean;
};

async function errorBody(error: unknown): Promise<FunctionError> {
  if (error instanceof FunctionsHttpError) {
    try {
      return (await error.context.json()) as FunctionError;
    } catch {
      // fall through
    }
  }
  return {};
}

/** Saves a JSON document through the browser's download, named with today's date. */
function saveJson(data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = `upay-compass-my-data-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

/**
 * "Your data": download everything the app holds about the person (export-my-data), and delete the
 * account for good (delete-account). Deleting needs the current PIN and a typed word, and signs
 * the person out afterwards.
 */
export function PrivacyCard() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signOut } = useAuth();
  const online = useOnline();
  const [downloading, setDownloading] = useState(false);
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [pin, setPin] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setDownloading(true);
    const { data, error: failure } = await supabase.functions.invoke("export-my-data", {
      body: {},
    });
    setDownloading(false);
    if (failure) {
      const body = await errorBody(failure);
      return toast.error(
        t(
          body.error === "rate_limited"
            ? "profile.privacy_download_limited"
            : "profile.privacy_download_failed",
        ),
      );
    }
    saveJson(data);
    toast.success(t("profile.privacy_toast_downloaded"));
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDeleting(true);
    const { error: failure } = await supabase.functions.invoke("delete-account", {
      body: { pin, confirm: true },
    });
    if (!failure) {
      // the account is gone: clear this device and go to the sign-in screen
      await signOut();
      router.replace("/login");
      return;
    }
    const body = await errorBody(failure);
    setDeleting(false);
    setPin("");
    if (body.error === "wrong_pin" && (body.locked_seconds ?? 0) > 0) {
      setError(t("profile.privacy_delete_wait", { seconds: body.locked_seconds }));
    } else if (body.error === "wrong_pin") {
      setError(t("profile.privacy_delete_wrong_pin", { count: body.attempts_left ?? 0 }));
    } else if (body.error === "rate_limited") {
      setError(t("profile.privacy_delete_limited"));
    } else {
      setError(t("profile.privacy_delete_failed"));
    }
  }

  const ready = word === t("profile.privacy_delete_word") && /^\d{4,6}$/.test(pin);

  return (
    <section className="finance-card space-y-4 p-5 sm:p-6" aria-labelledby="profile-privacy">
      <h2 id="profile-privacy" className="text-[17px] font-bold">
        {t("profile.privacy_data_title")}
      </h2>
      <p className="text-muted-foreground text-sm leading-6">{t("profile.privacy_data_hint")}</p>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        loading={downloading}
        disabled={!online}
        onClick={() => void download()}
      >
        <Download className="size-4" aria-hidden />
        {downloading ? t("profile.privacy_downloading") : t("profile.privacy_download")}
      </Button>

      {!open ? (
        <Button
          type="button"
          variant="destructive"
          className="w-full"
          disabled={!online}
          onClick={() => setOpen(true)}
        >
          <Trash2 className="size-4" aria-hidden />
          {t("profile.privacy_delete_open")}
        </Button>
      ) : (
        <form
          onSubmit={deleteAccount}
          className="border-destructive/40 space-y-4 rounded-2xl border p-4"
          noValidate
        >
          <h3 className="text-destructive text-[15px] font-bold">
            {t("profile.privacy_delete_title")}
          </h3>
          <p className="text-sm leading-6">{t("profile.privacy_delete_warning")}</p>
          <div className="space-y-2">
            <Label htmlFor="delete-word">{t("profile.privacy_delete_type")}</Label>
            <Input
              id="delete-word"
              autoComplete="off"
              autoCapitalize="characters"
              value={word}
              onChange={(e) => setWord(e.target.value.trim())}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="delete-pin">{t("profile.privacy_delete_pin")}</Label>
            <Input
              id="delete-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              variant="destructive"
              loading={deleting}
              disabled={!ready || !online}
            >
              {t("profile.privacy_delete_confirm")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => {
                setOpen(false);
                setWord("");
                setPin("");
                setError(null);
              }}
            >
              {t("profile.privacy_delete_cancel")}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
