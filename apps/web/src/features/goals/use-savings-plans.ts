import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PlanSuggestion, SavingsPlanProvider } from "@compass/shared";
import { UpaySimPlanProvider } from "@compass/upay-sim";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-provider";

/**
 * The one place the savings-plan provider is chosen. Today it is the adapter in adapters/upay-sim,
 * which only returns a reference; a real upay product API would implement SavingsPlanProvider and
 * be created here instead. Nothing else in the app changes.
 */
const provider: SavingsPlanProvider = new UpaySimPlanProvider();

export type SavingsPlan = {
  id: string;
  goal_id: string;
  monthly_amount: number;
  tenure_months: number;
  illustrative_rate: number;
  projected_maturity: number;
  status: "requested" | "cancelled";
  reference: string;
  created_at: string;
};

export function useSavingsPlans() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["goals", userId, "plans"],
    enabled: Boolean(userId),
    queryFn: async (): Promise<SavingsPlan[]> => {
      const { data, error } = await supabase
        .from("savings_plans")
        .select(
          "id,goal_id,monthly_amount,tenure_months,illustrative_rate,projected_maturity,status,reference,created_at",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((p) => ({
        ...p,
        monthly_amount: Number(p.monthly_amount),
        illustrative_rate: Number(p.illustrative_rate),
        projected_maturity: Number(p.projected_maturity),
      })) as SavingsPlan[];
    },
  });
}

/** Activity entry for the person's own log: the event and a count, never an amount or a goal name. */
async function logPlanEvent(userId: string, action: string) {
  const { count } = await supabase
    .from("savings_plans")
    .select("id", { count: "exact", head: true })
    .eq("status", "requested");
  await supabase.from("audit_log").insert({
    user_id: userId,
    action,
    entity: "savings_plan",
    detail: { active_plans: count ?? 0 },
  });
}

function useInvalidatePlans() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["goals", userId, "plans"] });
}

/** Passes the plan through the adapter, then stores it. Moves no money. */
export function useCreateSavingsPlan() {
  const { userId } = useAuth();
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: async (input: { goalId: string; plan: PlanSuggestion }) => {
      if (!userId) throw new Error("Not signed in");
      const { plan } = input;
      const receipt = await provider.createSavingsPlan({
        goalId: input.goalId,
        monthlyAmount: plan.monthlyAmount,
        tenureMonths: plan.tenureMonths,
        illustrativeRate: plan.annualRate,
        projectedMaturity: plan.projectedMaturity,
      });
      const { data, error } = await supabase
        .from("savings_plans")
        .insert({
          user_id: userId,
          goal_id: input.goalId,
          monthly_amount: plan.monthlyAmount,
          tenure_months: plan.tenureMonths,
          illustrative_rate: plan.annualRate,
          projected_maturity: plan.projectedMaturity,
          reference: receipt.reference,
        })
        .select("id")
        .single();
      if (error) throw error;
      void logPlanEvent(userId, "savings_plan_requested");
      return { id: data.id as string, reference: receipt.reference };
    },
    onSuccess: invalidate,
  });
}

export function useCancelSavingsPlan() {
  const { userId } = useAuth();
  const invalidate = useInvalidatePlans();
  return useMutation({
    mutationFn: async (planId: string) => {
      const { error } = await supabase.rpc("cancel_savings_plan", { p_plan_id: planId });
      if (error) throw error;
      if (userId) void logPlanEvent(userId, "savings_plan_cancelled");
    },
    onSuccess: invalidate,
  });
}
