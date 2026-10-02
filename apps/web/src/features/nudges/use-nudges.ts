import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-provider";

export type Nudge = {
  id: string;
  type: string;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
};

export function useNudges() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["nudges", userId, "list"],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Nudge[]> => {
      const { data, error } = await supabase
        .from("nudges")
        .select("id,type,data,read,created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Nudge[];
    },
  });
}

export function useUnreadNudgeCount() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["nudges", userId, "unread"],
    enabled: Boolean(userId),
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("nudges")
        .select("id", { count: "exact", head: true })
        .eq("read", false);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useMarkNudgesRead() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[] | "all") => {
      let query = supabase.from("nudges").update({ read: true });
      query = ids === "all" ? query.eq("read", false) : query.in("id", ids);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nudges", userId] }),
  });
}
