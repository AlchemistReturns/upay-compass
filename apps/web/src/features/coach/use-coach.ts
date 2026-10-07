import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { detectAffordIntent } from "@compass/shared";
import { useAuth } from "@/features/auth/auth-provider";
import { demoMark } from "@/features/demo/demo-timer";

export type CoachMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export function useCoachHistory() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["coach", userId, "history"],
    enabled: Boolean(userId),
    queryFn: async (): Promise<CoachMessage[]> => {
      const { data, error } = await supabase
        .from("coach_messages")
        .select("id,role,content,created_at")
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return ((data ?? []) as CoachMessage[]).reverse();
    },
  });
}

export function useClearChat() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("coach_messages").delete().eq("user_id", userId!);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["coach", userId] }),
  });
}

export function useGiveConsent() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ coach_consent_at: new Date().toISOString() })
        .eq("id", userId!);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile", userId] }),
  });
}

export type ChatStatus = "idle" | "waiting" | "streaming";
export type ChatError = "rate_limited" | "consent_required" | "failed" | null;

/** Streams the coach's answer (server-sent events) into a pending bubble, then refreshes the history. */
export function useCoachChat() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState<ChatError>(null);
  const [pending, setPending] = useState<{ question: string; answer: string } | null>(null);
  const lastQuestion = useRef("");
  /** Set when the answer was a "can I afford X?" verdict: the amount asked about. */
  const [afford, setAfford] = useState<{ amount: number; verdict: string } | null>(null);

  const send = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (!text || status !== "idle") return;
      lastQuestion.current = text;
      setError(null);
      setAfford(null);
      setStatus("waiting");
      setPending({ question: text, answer: "" });

      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("no_session");

        const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/coach-chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ message: text }),
        });

        if (res.status === 429) throw new Error("rate_limited");
        if (res.status === 403) throw new Error("consent_required");
        if (!res.ok || !res.body) throw new Error("failed");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const event of events) {
            if (!event.startsWith("data:")) continue;
            try {
              const payload = JSON.parse(event.slice(5)) as {
                delta?: string;
                done?: boolean;
                affordability?: string | null;
              };
              if (payload.done && payload.affordability) {
                const intent = detectAffordIntent(text);
                if (intent) setAfford({ amount: intent.amount, verdict: payload.affordability });
              }
              if (payload.delta) {
                demoMark("explained");
                setStatus("streaming");
                setPending((p) => (p ? { ...p, answer: p.answer + payload.delta } : p));
              }
            } catch {
              // ignore a partial event
            }
          }
        }
        await queryClient.invalidateQueries({ queryKey: ["coach", userId] });
        setPending(null);
      } catch (e) {
        const code = e instanceof Error ? e.message : "failed";
        setError(code === "rate_limited" || code === "consent_required" ? code : "failed");
        // Keep whatever arrived; the history refresh below shows what the server stored.
        await queryClient.invalidateQueries({ queryKey: ["coach", userId] });
        setPending(null);
      } finally {
        setStatus("idle");
      }
    },
    [status, userId, queryClient],
  );

  const retry = useCallback(() => void send(lastQuestion.current), [send]);
  return {
    send,
    retry,
    status,
    error,
    pending,
    afford,
    clearAfford: () => setAfford(null),
    dismissError: () => setError(null),
  };
}
