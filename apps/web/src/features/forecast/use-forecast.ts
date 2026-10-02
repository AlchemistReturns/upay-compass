import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Backtest, ForecastPoint, RiskFlag } from "@compass/shared";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-provider";

export type RecurringSummary = {
  counterparty: string;
  channel: string;
  direction: "in" | "out";
  cadence: "weekly" | "biweekly" | "monthly";
  expectedAmount: number;
  amountStable: boolean;
  nextDay: string;
};

export type ForecastDetails = {
  insufficient: boolean;
  confidence: "low" | "ok";
  today: string;
  startBalance: number;
  safetyBuffer: number;
  lowest: ForecastPoint | null;
  firstRiskDay: string | null;
  expectedIncome: number;
  expectedBills: number;
  recurring: RecurringSummary[];
  backtest: Backtest | null;
};

export type ForecastSnapshot = {
  id: string;
  projected_balance: ForecastPoint[];
  risk_flags: RiskFlag[];
  details: ForecastDetails;
  computed_at: string;
};

export function useLatestForecast() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["forecast", userId, "latest"],
    enabled: Boolean(userId),
    queryFn: async (): Promise<ForecastSnapshot | null> => {
      const { data, error } = await supabase
        .from("forecasts")
        .select("id,projected_balance,risk_flags,details,computed_at")
        .order("computed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as ForecastSnapshot | null) ?? null;
    },
  });
}

/** Ask the server for a fresh forecast. Best effort: the previous snapshot stays valid if it fails. */
export function useRefreshForecast() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useCallback(async () => {
    try {
      await supabase.functions.invoke("forecast-cashflow", { body: {} });
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["forecast", userId] });
    }
  }, [queryClient, userId]);
}
