import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-provider";

/**
 * "My AI activity": counts from the person's OWN audit_log rows (row level security already limits
 * reads to their own). Only the kind of action and when it happened are read, never any content,
 * because none is stored there.
 */
const COACH = ["coach_slot"];
const VOICE = ["voice_command", "voice_transcribe", "voice_speak"];
const LESSONS = ["learn_generate"];
const DAYS = 30;

export type AiActivity = { coach: number; voice: number; lessons: number; lastUsed: string | null };

export function useAiActivity() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["ai-activity", userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<AiActivity> => {
      const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("audit_log")
        .select("action,created_at")
        .in("action", [...COACH, ...VOICE, ...LESSONS])
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      const rows = data ?? [];
      const count = (actions: string[]) => rows.filter((r) => actions.includes(r.action)).length;
      return {
        coach: count(COACH),
        voice: count(VOICE),
        lessons: count(LESSONS),
        lastUsed: rows[0]?.created_at ?? null,
      };
    },
  });
}

/** Withdraws one consent (coach or voice); the matching functions refuse until it is given again. */
export function useStopSharing(column: "coach_consent_at" | "voice_consent_at") {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ [column]: null })
        .eq("id", userId!);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile", userId] }),
  });
}
