import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPeriodRange, type Period } from "@compass/shared";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-provider";
import type { CategorySpend, DashboardSummary, WeekPoint } from "./types";

async function fetchSummary(range: { from: string; to: string }): Promise<DashboardSummary> {
  const { data, error } = await supabase.rpc("dashboard_summary", {
    p_from: range.from,
    p_to: range.to,
  });
  if (error) throw error;
  const row = data?.[0];
  return {
    income: Number(row?.income ?? 0),
    expense: Number(row?.expense ?? 0),
    tx_count: Number(row?.tx_count ?? 0),
  };
}

/** All dashboard queries share the ["dashboard", userId, ...] prefix so realtime can refresh them at once. */
export function useDashboard(period: Period) {
  const { userId } = useAuth();
  const range = useMemo(() => getPeriodRange(period), [period]);
  const enabled = Boolean(userId);

  const summary = useQuery({
    queryKey: ["dashboard", userId, "summary", period],
    enabled,
    queryFn: () => fetchSummary(range),
  });

  // The balance card always shows this month, whatever period the tabs below are on.
  // Same key as the "month" tab, so the two share one cached result.
  const monthRange = useMemo(() => getPeriodRange("month"), []);
  const month = useQuery({
    queryKey: ["dashboard", userId, "summary", "month"],
    enabled,
    queryFn: () => fetchSummary(monthRange),
  });

  const byCategory = useQuery({
    queryKey: ["dashboard", userId, "by-category", period],
    enabled,
    queryFn: async (): Promise<CategorySpend[]> => {
      const { data, error } = await supabase.rpc("spend_by_category", {
        p_from: range.from,
        p_to: range.to,
      });
      if (error) throw error;
      return (data ?? []).map((r: CategorySpend) => ({
        category_id: r.category_id,
        total: Number(r.total),
        tx_count: Number(r.tx_count),
      }));
    },
  });

  const trend = useQuery({
    queryKey: ["dashboard", userId, "trend"],
    enabled,
    queryFn: async (): Promise<WeekPoint[]> => {
      const { data, error } = await supabase.rpc("weekly_trend", { p_weeks: 8 });
      if (error) throw error;
      return (data ?? []).map((r: WeekPoint) => ({
        week_start: r.week_start,
        income: Number(r.income),
        expense: Number(r.expense),
      }));
    },
  });

  const balance = useQuery({
    queryKey: ["dashboard", userId, "balance"],
    enabled,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("wallet_balance");
      if (error) throw error;
      return Number(data ?? 0);
    },
  });

  return { summary, month, byCategory, trend, balance };
}
