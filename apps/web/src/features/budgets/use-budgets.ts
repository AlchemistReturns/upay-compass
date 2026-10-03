import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-provider";
import { useRefreshHealth } from "@/features/health/use-health";

export type BudgetProgress = {
  budget_id: string;
  category_id: number;
  limit_amount: number;
  alert_threshold: number;
  spent: number;
};

export function useBudgetProgress() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["budgets", userId, "progress"],
    enabled: Boolean(userId),
    queryFn: async (): Promise<BudgetProgress[]> => {
      const { data, error } = await supabase.rpc("budget_progress");
      if (error) throw error;
      return (data ?? []).map((r: BudgetProgress) => ({
        budget_id: r.budget_id,
        category_id: r.category_id,
        limit_amount: Number(r.limit_amount),
        alert_threshold: Number(r.alert_threshold),
        spent: Number(r.spent),
      }));
    },
  });
}

function useAfterBudgetChange() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const refreshHealth = useRefreshHealth();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: ["budgets", userId] });
    await queryClient.invalidateQueries({ queryKey: ["nudges", userId] });
    // The health score depends on budgets, so recompute it.
    void refreshHealth();
  };
}

export function useSaveBudget() {
  const { userId } = useAuth();
  const after = useAfterBudgetChange();
  return useMutation({
    mutationFn: async (input: {
      category_id: number;
      limit_amount: number;
      alert_threshold: number;
    }) => {
      if (!userId) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("budgets")
        .upsert({ user_id: userId, ...input }, { onConflict: "user_id,category_id" })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: after,
  });
}

export function useDeleteBudget() {
  const after = useAfterBudgetChange();
  return useMutation({
    mutationFn: async (budgetId: string) => {
      const { error } = await supabase.from("budgets").delete().eq("id", budgetId);
      if (error) throw error;
    },
    onSuccess: after,
  });
}
