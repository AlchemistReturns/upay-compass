import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  LEARN_TOPIC_REASONS,
  topicById,
  validateGeneratedModule,
  type GeneratedModule,
  type LearnLanguage,
  type ModuleFacts,
  type TopicReason,
} from "@compass/shared";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-provider";
import { useProfile } from "@/features/profile/use-profile";

/** A "Made for you" module that passed validation (on the server, and again here). */
export type ForYouModule = {
  id: string;
  topicId: string;
  reason: TopicReason;
  module: GeneratedModule;
  minutes: number;
  completedAt: string | null;
  quickCheckScore: number | null;
  feedback: -1 | 1 | null;
};

export type ForYouState = { kind: "no_consent" } | { kind: "ready"; modules: ForYouModule[] };

type Row = {
  id: string;
  topic_id: string;
  language: string;
  content: Record<string, unknown>;
  facts: ModuleFacts;
  reason_id: string;
  expires_at: string;
  completed_at: string | null;
  quick_check_score: number | null;
  feedback: number | null;
  dismissed_at: string | null;
};

const COLUMNS =
  "id,topic_id,language,content,facts,reason_id,expires_at,completed_at,quick_check_score,feedback,dismissed_at";
const REASONS = new Set<string>(LEARN_TOPIC_REASONS);

/**
 * Checks a stored row again before it is shown: the topic and reason must be known and the text
 * must pass the same validator, against the facts it was written from. A row that fails is dropped,
 * so model text that somehow skipped the server check is still never shown.
 */
function toModule(row: Row, language: LearnLanguage): ForYouModule | null {
  const topic = topicById(row.topic_id);
  if (!topic || !REASONS.has(row.reason_id) || row.language !== language || row.dismissed_at) {
    return null;
  }
  // minutes and the version mark are added by code; the rest is the model's output
  const { minutes, ...rest } = row.content as { minutes?: unknown; v?: unknown };
  const output: Record<string, unknown> = { ...rest };
  delete output.v;
  const checked = validateGeneratedModule(output, row.facts ?? {}, topic, language);
  if (!checked.ok || typeof minutes !== "number") return null;
  return {
    id: row.id,
    topicId: row.topic_id,
    reason: row.reason_id as TopicReason,
    module: checked.module,
    minutes,
    completedAt: row.completed_at,
    quickCheckScore: row.quick_check_score,
    feedback: row.feedback === 1 || row.feedback === -1 ? row.feedback : null,
  };
}

/** Rows already stored, read directly (RLS): used when the function cannot be reached. */
async function readStored(language: LearnLanguage): Promise<Row[]> {
  const { data, error } = await supabase
    .from("personalized_modules")
    .select(COLUMNS)
    .eq("language", language)
    .is("dismissed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("generated_at", { ascending: false })
    .limit(3);
  if (error) throw error;
  return (data ?? []) as Row[];
}

export const forYouKey = (userId: string | null, language: string) =>
  ["learn", userId, "for-you", language] as const;

/**
 * The person's "Made for you" modules in the app language. Asks the server to refresh them (it
 * reuses fresh ones and writes missing ones), and falls back to the stored ones when the server is
 * busy, rate-limited or unreachable. Kept for offline reading like the rest of Learn. Without the
 * coach consent nothing is requested.
 */
export function useForYou() {
  const { userId } = useAuth();
  const { i18n } = useTranslation();
  const language: LearnLanguage = i18n.language === "en" ? "en" : "bn";
  const profile = useProfile(userId);
  const consented = Boolean(profile.data?.coach_consent_at);

  const query = useQuery({
    queryKey: forYouKey(userId, language),
    enabled: Boolean(userId) && profile.isSuccess && consented,
    staleTime: 30 * 60_000,
    retry: false,
    queryFn: async (): Promise<ForYouModule[]> => {
      let rows: Row[];
      const { data, error } = await supabase.functions.invoke("generate-learn-modules", {
        body: { language },
      });
      if (!error && Array.isArray(data?.modules)) rows = data.modules as Row[];
      else rows = await readStored(language);
      return rows.flatMap((r) => toModule(r, language) ?? []);
    },
  });

  const state: ForYouState | null = !profile.isSuccess
    ? null
    : !consented
      ? { kind: "no_consent" }
      : query.data
        ? { kind: "ready", modules: query.data }
        : null;

  return {
    state,
    language,
    isPending: profile.isPending || (consented && query.isPending),
    isError: profile.isError || query.isError,
  };
}

type Update = {
  id: string;
  completed?: boolean;
  quickCheckScore?: number;
  feedback?: -1 | 0 | 1;
  dismissed?: boolean;
};

/**
 * Progress on a personalized module (finished, quick-check score, thumbs, "not for me"), through
 * the one database function allowed to change it. Updates the saved list in place instead of
 * refetching, so it does not ask the server to write modules again. Does not touch the 8-module
 * progress, streaks or badges.
 */
export function useUpdateForYou() {
  const { userId } = useAuth();
  const { i18n } = useTranslation();
  const queryClient = useQueryClient();
  const key = forYouKey(userId, i18n.language === "en" ? "en" : "bn");
  return useMutation({
    mutationFn: async (u: Update) => {
      const { data, error } = await supabase.rpc("update_personalized_module", {
        p_id: u.id,
        p_completed: u.completed ?? null,
        p_quick_check_score: u.quickCheckScore ?? null,
        p_feedback: u.feedback ?? null,
        p_dismissed: u.dismissed ?? null,
      });
      if (error) throw error;
      return data as {
        id: string;
        completed_at: string | null;
        quick_check_score: number | null;
        feedback: number | null;
        dismissed_at: string | null;
      };
    },
    onSuccess: (row) => {
      queryClient.setQueryData<ForYouModule[]>(key, (list) =>
        list?.flatMap((m) =>
          m.id !== row.id
            ? [m]
            : row.dismissed_at
              ? []
              : [
                  {
                    ...m,
                    completedAt: row.completed_at,
                    quickCheckScore: row.quick_check_score,
                    feedback: row.feedback === 1 || row.feedback === -1 ? row.feedback : null,
                  },
                ],
        ),
      );
    },
  });
}
