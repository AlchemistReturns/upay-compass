"use client";

import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/confirm";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-provider";
import { useProfile } from "@/features/profile/use-profile";

/**
 * Agreeing to send voice to OpenAI (recordings for transcription; the words of a spoken command
 * for understanding). Asked once, at the first use of a server voice feature, and stored on the
 * profile; the server refuses without it.
 */
export function useVoiceConsent() {
  const { t } = useTranslation();
  const { userId } = useAuth();
  const profile = useProfile(userId);
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const grant = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ voice_consent_at: new Date().toISOString() })
        .eq("id", userId!);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile", userId] }),
  });

  const consented = Boolean(profile.data?.voice_consent_at);

  /** Resolves true when the person has agreed (asking them first if they have not). */
  const ensure = useCallback(async (): Promise<boolean> => {
    if (consented) return true;
    const ok = await confirm({
      title: t("voice.consent_title"),
      description: t("voice.consent_body"),
      confirmLabel: t("voice.consent_accept"),
      destructive: false,
    });
    if (!ok) return false;
    try {
      await grant.mutateAsync();
      return true;
    } catch {
      return false;
    }
  }, [consented, confirm, grant, t]);

  return { consented, ensure };
}
