import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-provider";

const MIN_GAP_MS = 60 * 60 * 1000;

/**
 * Evaluates the rule-driven nudges (overspend, goal behind, bill due, forecast dip) at most once an
 * hour per browser session while the app is open. The server de-duplicates, so extra calls are harmless.
 * This stands in for an hourly job until scheduled jobs are set up.
 */
export function useAutoNudges(enabled: boolean) {
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !userId) return;
    const key = `compass.nudges.${userId}`;
    try {
      const last = Number(sessionStorage.getItem(key) ?? 0);
      if (Date.now() - last < MIN_GAP_MS) return;
      sessionStorage.setItem(key, String(Date.now()));
    } catch {
      // storage unavailable: just run
    }
    void supabase.functions
      .invoke("generate-nudges", { body: {} })
      .finally(() => queryClient.invalidateQueries({ queryKey: ["nudges", userId] }));
  }, [enabled, userId, queryClient]);
}
