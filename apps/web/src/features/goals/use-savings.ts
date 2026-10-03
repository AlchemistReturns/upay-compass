import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-provider";
import { useRefreshHealth } from "@/features/health/use-health";

export type Savings = {
  /** Money allocated to goals (including round-ups). */
  allocated: number;
  /** Money held in savings without a goal; the part that can be withdrawn. */
  free: number;
  total: number;
};

/** The savings account: money moved here has left the wallet. */
export function useSavings() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["savings", userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Savings> => {
      const { data, error } = await supabase.rpc("savings_summary");
      if (error) throw error;
      const r = (data ?? {}) as Record<string, unknown>;
      return {
        allocated: Number(r.allocated ?? 0),
        free: Number(r.free ?? 0),
        total: Number(r.total ?? 0),
      };
    },
  });
}

/** After any move between the wallet and savings: balances, goals and the score all change. */
export function useAfterSavingsChange() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const refreshHealth = useRefreshHealth();
  return async () => {
    void refreshHealth();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["savings", userId] }),
      queryClient.invalidateQueries({ queryKey: ["goals", userId] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard", userId] }),
      queryClient.invalidateQueries({ queryKey: ["profile", userId] }),
    ]);
  };
}

export function useDepositSavings() {
  const after = useAfterSavingsChange();
  return useMutation({
    mutationFn: async (amount: number) => {
      const { error } = await supabase.rpc("deposit_to_savings", { p_amount: amount });
      if (error) throw error;
    },
    onSuccess: after,
  });
}

export function useWithdrawSavings() {
  const after = useAfterSavingsChange();
  return useMutation({
    mutationFn: async (amount: number) => {
      const { error } = await supabase.rpc("withdraw_from_savings", { p_amount: amount });
      if (error) throw error;
    },
    onSuccess: after,
  });
}

/** The translation key for a failed move of money, so the person sees why. */
export function moneyMoveErrorKey(e: unknown): string {
  const message = e instanceof Error ? e.message : String((e as { message?: string })?.message);
  if (/insufficient_balance/.test(message)) return "savings.error_balance";
  if (/insufficient_savings/.test(message)) return "savings.error_free";
  return "common.error";
}
