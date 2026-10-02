import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-provider";
import {
  announceGamification,
  type GamificationResult,
} from "@/features/gamification/gamification";

export type LearnModule = {
  id: number;
  slug: string;
  position: number;
  level: number;
  minutes: number;
  title_en: string;
  title_bn: string;
  summary_en: string;
  summary_bn: string;
  body_md_en: string;
  body_md_bn: string;
};

/**
 * All modules in one small query (about 25 KB with both languages), so once the hub has loaded
 * every module can be read offline from the saved copy.
 */
export function useModules() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["learn", userId, "modules"],
    enabled: Boolean(userId),
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<LearnModule[]> => {
      const { data, error } = await supabase.from("learn_modules").select("*").order("position");
      if (error) throw error;
      return (data ?? []) as LearnModule[];
    },
  });
}

/** Ids of the modules this user has finished. */
export function useCompletedModules() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["learn", userId, "progress"],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Set<number>> => {
      const { data, error } = await supabase.from("user_progress").select("module_id");
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.module_id as number));
    },
  });
}

export function useCompleteModule() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (slug: string) => {
      const { data, error } = await supabase.rpc("complete_module", { p_slug: slug });
      if (error) throw error;
      return data as GamificationResult;
    },
    onSuccess: async (result) => {
      announceGamification(result);
      await queryClient.invalidateQueries({ queryKey: ["learn", userId, "progress"] });
    },
  });
}
