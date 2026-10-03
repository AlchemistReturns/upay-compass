import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReadinessResult } from "@compass/shared";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-provider";

export type ReadinessSnapshot = {
  id: string;
  score: number;
  breakdown: ReadinessResult;
  computed_at: string;
};

/** The two most recent snapshots: the latest score and what it is compared against. */
export function useReadinessSnapshots() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["readiness", userId, "snapshots"],
    enabled: Boolean(userId),
    queryFn: async (): Promise<ReadinessSnapshot[]> => {
      const { data, error } = await supabase
        .from("readiness_scores")
        .select("id,score,breakdown,computed_at")
        .order("computed_at", { ascending: false })
        .limit(2);
      if (error) throw error;
      return (data ?? []) as ReadinessSnapshot[];
    },
  });
}

/** Asks the server to recompute (when the screen opens with a stale or missing snapshot). */
export function useRefreshReadiness() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useCallback(async () => {
    try {
      await supabase.functions.invoke("compute-readiness-score", { body: {} });
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["readiness", userId] });
    }
  }, [queryClient, userId]);
}
