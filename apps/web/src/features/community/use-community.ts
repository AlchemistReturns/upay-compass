import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-provider";

type Suppressed = { suppressed: true };

export type CommunityInsights = {
  min_group_size: number;
  spending:
    | {
        people: number;
        top_categories: {
          key: string;
          name_en: string;
          name_bn: string;
          share: number;
          mine_share: number | null;
        }[];
      }
    | Suppressed;
  health:
    | {
        people: number;
        avg_score: number;
        mine: number | null;
        type_people: number | null;
        type_avg: number | null;
      }
    | Suppressed;
  goals:
    | { people: number; completion_rate: number; mine_goals: number; mine_completed: number }
    | Suppressed;
  roundups: { people: number; avg_per_person: number; mine: number } | Suppressed;
  learning: { people: number; avg_modules: number; modules: number; mine: number } | Suppressed;
};

export function isHidden<T extends object>(section: T | Suppressed): section is Suppressed {
  return "suppressed" in section;
}

/** Group figures (hidden for groups under 5 people) next to the person's own numbers. */
export function useCommunityInsights() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["community", userId],
    enabled: Boolean(userId),
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CommunityInsights> => {
      const { data, error } = await supabase.rpc("community_insights");
      if (error) throw error;
      return data as CommunityInsights;
    },
  });
}
