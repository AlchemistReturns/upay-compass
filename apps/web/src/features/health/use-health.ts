import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { HealthResult } from "@compass/shared";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-provider";

export type HealthSnapshot = {
  id: string;
  score: number;
  breakdown: HealthResult;
  computed_at: string;
};

/** The two most recent snapshots: the latest score and what it is compared against. */
export function useHealthSnapshots() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["health", userId, "snapshots"],
    enabled: Boolean(userId),
    queryFn: async (): Promise<HealthSnapshot[]> => {
      const { data, error } = await supabase
        .from("health_scores")
        .select("id,score,breakdown,computed_at")
        .order("computed_at", { ascending: false })
        .limit(2);
      if (error) throw error;
      return (data ?? []) as HealthSnapshot[];
    },
  });
}

/**
 * Asks the server to recompute the score (after budget changes, and when the score screen opens
 * with a stale snapshot). Best effort: the previous snapshot stays valid if this fails.
 */
export function useRefreshHealth() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useCallback(async () => {
    try {
      await supabase.functions.invoke("compute-health-score", { body: {} });
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["health", userId] });
    }
  }, [queryClient, userId]);
}
