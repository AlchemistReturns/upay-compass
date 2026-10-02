import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-provider";
import type { GamificationState } from "./gamification";

export function useGamification() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["gamification", userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<GamificationState> => {
      const { data, error } = await supabase
        .from("gamification")
        .select("streak_days,badges")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return (data as GamificationState | null) ?? { streak_days: 0, badges: [] };
    },
  });
}
