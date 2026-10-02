import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-provider";

type Suppressed = { suppressed: true };

export type AdminInsights = {
  min_group_size: number;
  generated_at: string;
  people: { onboarded: number } | Suppressed;
  spending:
    | {
        people: number;
        total: number;
        top_categories: {
          key: string;
          name_en: string;
          name_bn: string;
          total: number;
          share: number;
          people: number;
        }[];
      }
    | Suppressed;
  health:
    | {
        people: number;
        avg_score: number;
        by_income_type: { income_type: string; people: number; avg_score: number }[];
      }
    | Suppressed;
  goals: { people: number; goals: number; completed: number; completion_rate: number } | Suppressed;
  roundups: { people: number; total: number } | Suppressed;
  learning:
    { people: number; avg_modules: number; graduates: number; modules: number } | Suppressed;
};

export function isSuppressed<T extends object>(section: T | Suppressed): section is Suppressed {
  return "suppressed" in section;
}

export function useAdminInsights() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["admin", userId, "insights"],
    enabled: Boolean(userId),
    retry: false,
    queryFn: async (): Promise<AdminInsights> => {
      const { data, error } = await supabase.rpc("admin_insights");
      if (error) throw error;
      return data as AdminInsights;
    },
  });
}

export function useSeedCohort() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("seed-demo", { body: {} });
      if (error) throw error;
      return data as { people: number };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", userId] }),
  });
}
