import { useQuery } from "@tanstack/react-query";
import type { HealthSnapshot } from "@compass/shared";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-provider";

export type HealthWindow = 24 | 168;

/**
 * The aggregates for the Performance page (any signed-in user; aggregates only). Each
 * call writes one audit entry, so it never refreshes on its own: the person taps Refresh.
 */
export function useSystemHealth(hours: HealthWindow, enabled: boolean) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["admin", userId, "health", hours],
    enabled: Boolean(userId) && enabled,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<HealthSnapshot> => {
      const { data, error } = await supabase.rpc("system_health", { p_hours: hours });
      if (error) throw error;
      return data as HealthSnapshot;
    },
  });
}
