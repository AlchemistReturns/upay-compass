import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-provider";
import { requestBadgeCheck } from "@/features/gamification/gamification";
import { useRefreshHealth } from "@/features/health/use-health";

export type Goal = {
  id: string;
  title: string;
  target_amount: number;
  saved_amount: number;
  target_date: string | null;
  status: "active" | "completed" | "archived";
  created_at: string;
};

export type GoalContribution = {
  id: string;
  goal_id: string;
  amount: number;
  source: "manual" | "roundup";
  created_at: string;
};

export function useGoals() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["goals", userId, "list"],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Goal[]> => {
      const { data, error } = await supabase
        .from("goals")
        .select("id,title,target_amount,saved_amount,target_date,status,created_at")
        .neq("status", "archived")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((g) => ({
        ...g,
        target_amount: Number(g.target_amount),
        saved_amount: Number(g.saved_amount),
      })) as Goal[];
    },
  });
}

export function useContributions() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["goals", userId, "contributions"],
    enabled: Boolean(userId),
    queryFn: async (): Promise<GoalContribution[]> => {
      const { data, error } = await supabase
        .from("goal_contributions")
        .select("id,goal_id,amount,source,created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []).map((c) => ({ ...c, amount: Number(c.amount) })) as GoalContribution[];
    },
  });
}

function useInvalidateGoals() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const refreshHealth = useRefreshHealth();
  return async () => {
    // money moved into or out of a goal changes the savings score, so refresh it
    void refreshHealth();
    await queryClient.invalidateQueries({ queryKey: ["goals", userId] });
    await queryClient.invalidateQueries({ queryKey: ["profile", userId] });
    // money in a goal has left the wallet, so balances and the score move too
    await queryClient.invalidateQueries({ queryKey: ["savings", userId] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard", userId] });
  };
}

export function useCreateGoal() {
  const { userId } = useAuth();
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      target_amount: number;
      target_date: string | null;
    }) => {
      if (!userId) throw new Error("Not signed in");
      const { error } = await supabase.from("goals").insert({ user_id: userId, ...input });
      if (error) throw error;
    },
    onSuccess: async () => {
      await invalidate();
      requestBadgeCheck();
    },
  });
}

export function useDeleteGoal() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: async (goalId: string) => {
      const { error } = await supabase.from("goals").delete().eq("id", goalId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useContribute() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: async (input: { goalId: string; amount: number }) => {
      const { data, error } = await supabase.rpc("contribute_to_goal", {
        p_goal_id: input.goalId,
        p_amount: input.amount,
      });
      if (error) throw error;
      // the new contribution's id, so the caller can offer an undo
      return data as string;
    },
    onSuccess: invalidate,
  });
}

export function useUndoContribution() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: async (contributionId: string) => {
      const { error } = await supabase.rpc("undo_goal_contribution", {
        p_contribution_id: contributionId,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useSetRoundup() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: async (input: { enabled: boolean; goalId: string | null }) => {
      const { error } = await supabase.rpc("set_roundup", {
        p_enabled: input.enabled,
        p_goal_id: input.goalId,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
