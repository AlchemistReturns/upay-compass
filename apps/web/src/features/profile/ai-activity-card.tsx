"use client";

import { Check, EyeOff, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/skeleton";
import { useConfirm } from "@/components/confirm";
import { toast } from "@/components/toaster";
import { formatNumber, formatShortDate } from "@/lib/format";
import { useOnline } from "@/features/pwa/use-online";
import type { Profile } from "./use-profile";
import { useAiActivity, useStopSharing } from "./use-ai-activity";

function Tile({ value, label }: { value: number; label: string }) {
  const { i18n } = useTranslation();
  return (
    <div className="bg-muted/70 rounded-2xl px-3 py-3 text-center">
      <p className="num text-2xl leading-none font-extrabold">
        {formatNumber(value, i18n.language)}
      </p>
      <p className="text-muted-foreground mt-1.5 text-xs leading-4">{label}</p>
    </div>
  );
}

/**
 * What the AI features have done for this person, and what they have agreed to share. Built only
 * from their own activity log; the list of data categories matches the consent text and never
 * shows content. Stopping reuses the same consent switches (a profile column each) the coach and
 * voice screens use.
 */
export function AiActivityCard({ profile }: { profile: Profile }) {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  const confirm = useConfirm();
  const activity = useAiActivity();
  const stopCoach = useStopSharing("coach_consent_at");
  const stopVoice = useStopSharing("voice_consent_at");

  async function stop(kind: "coach" | "voice") {
    const ok = await confirm({
      title: t(kind === "coach" ? "profile.ai_stop_coach" : "profile.ai_stop_voice"),
      description: t(
        kind === "coach" ? "profile.coach_stop_confirm" : "profile.voice_stop_confirm",
      ),
      confirmLabel: t(kind === "coach" ? "profile.ai_stop_coach" : "profile.ai_stop_voice"),
    });
    if (!ok) return;
    (kind === "coach" ? stopCoach : stopVoice).mutate(undefined, {
      onSuccess: () =>
        toast.success(
          t(kind === "coach" ? "profile.toast_sharing_off" : "profile.toast_voice_off"),
        ),
    });
  }

  const a = activity.data;
  const used = a ? a.coach + a.voice + a.lessons > 0 : false;
  const coachOn = Boolean(profile.coach_consent_at);
  const voiceOn = Boolean(profile.voice_consent_at);

  const shared: string[] = [
    ...(coachOn
      ? ["coach.consent_item_numbers", "coach.consent_item_goals", "coach.consent_item_learn"]
      : []),
    ...(voiceOn ? ["profile.ai_shared_voice"] : []),
  ];

  return (
    <section className="finance-card space-y-4 p-5 sm:p-6" aria-labelledby="profile-ai">
      <div>
        <h2 id="profile-ai" className="flex items-center gap-2 text-[17px] font-bold">
          <Sparkles className="text-primary size-[18px]" aria-hidden />
          {t("profile.ai_title")}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm leading-6">{t("profile.ai_hint")}</p>
      </div>

      {activity.isPending && <Skeleton className="h-20 rounded-2xl" />}
      {activity.isError && (
        <p role="alert" className="text-destructive text-sm">
          {t("common.error")}
        </p>
      )}
      {a && (
        <>
          <div className="grid grid-cols-3 gap-2.5">
            <Tile value={a.coach} label={t("profile.ai_coach")} />
            <Tile value={a.voice} label={t("profile.ai_voice")} />
            <Tile value={a.lessons} label={t("profile.ai_lessons")} />
          </div>
          <p className="text-muted-foreground text-sm">
            {used && a.lastUsed
              ? t("profile.ai_last", { date: formatShortDate(a.lastUsed, i18n.language) })
              : t("profile.ai_empty")}
          </p>
        </>
      )}

      <div>
        <h3 className="text-[13px] font-bold">{t("profile.ai_shared_title")}</h3>
        {shared.length === 0 ? (
          <p className="text-muted-foreground mt-1.5 text-sm leading-6">
            {t("profile.ai_shared_none")}
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {shared.map((key) => (
              <li key={key} className="flex items-start gap-2.5 text-sm leading-6">
                <span className="bg-positive-soft text-positive mt-0.5 grid size-5 shrink-0 place-items-center rounded-full">
                  <Check className="size-3" strokeWidth={3} aria-hidden />
                </span>
                {t(key)}
              </li>
            ))}
          </ul>
        )}
        <p className="text-muted-foreground mt-2.5 flex items-start gap-2.5 text-sm leading-6">
          <span className="bg-secondary text-primary mt-0.5 grid size-5 shrink-0 place-items-center rounded-full">
            <EyeOff className="size-3" aria-hidden />
          </span>
          {t("coach.consent_item_never")}
        </p>
      </div>

      {(coachOn || voiceOn) && (
        <div className="flex flex-wrap gap-2.5">
          {coachOn && (
            <Button
              variant="secondary"
              loading={stopCoach.isPending}
              disabled={!online}
              onClick={() => void stop("coach")}
            >
              {t("profile.ai_stop_coach")}
            </Button>
          )}
          {voiceOn && (
            <Button
              variant="secondary"
              loading={stopVoice.isPending}
              disabled={!online}
              onClick={() => void stop("voice")}
            >
              {t("profile.ai_stop_voice")}
            </Button>
          )}
        </div>
      )}
      {(stopCoach.isError || stopVoice.isError) && (
        <p role="alert" className="text-destructive text-sm">
          {t("common.error")}
        </p>
      )}
    </section>
  );
}
