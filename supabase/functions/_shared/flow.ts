import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RECURRING_LOOKBACK_DAYS,
  backtestForecast,
  forecastCashflow,
  addDays,
  dhakaDay,
  type Forecast,
  type FlowTx,
} from "@compass/shared";
import { adminClient } from "./http.ts";
import { canonical, roundDeep } from "./snapshot.ts";

export type Flow = { balance: number; transactions: FlowTx[] };

/** The caller's recent transactions (as the caller, so RLS applies) and wallet balance. */
export async function loadFlow(client: SupabaseClient, now: Date = new Date()): Promise<Flow> {
  // A few days more than the look-back, so a payment on the edge is not cut off by time zones.
  const since = addDays(dhakaDay(now), -(RECURRING_LOOKBACK_DAYS + 5));

  const [txs, balance] = await Promise.all([
    client
      .from("transactions")
      .select("amount,direction,channel,counterparty,occurred_at,categories(is_essential)")
      .gte("occurred_at", `${since}T00:00:00Z`)
      .order("occurred_at", { ascending: true })
      .limit(5000),
    client.rpc("wallet_balance"),
  ]);
  if (txs.error) throw txs.error;
  if (balance.error) throw balance.error;

  const transactions = (txs.data ?? []).map((t) => {
    const cat = t.categories as unknown as { is_essential: boolean } | null;
    return {
      direction: t.direction as "in" | "out",
      channel: t.channel as FlowTx["channel"],
      counterparty: t.counterparty as string,
      amount: Number(t.amount),
      occurred_at: t.occurred_at as string,
      essential: Boolean(cat?.is_essential),
    };
  });
  return { balance: Number(balance.data ?? 0), transactions };
}

export type ForecastSnapshot = {
  forecast: Forecast;
  backtest: ReturnType<typeof backtestForecast>;
};

/**
 * Computes the caller's 30-day forecast and stores a snapshot (service role) when it changed.
 * Also measures the forecast against a seasonal-naive baseline when there is history for it.
 */
export async function refreshForecast(
  userClient: SupabaseClient,
  userId: string,
  preloaded?: Flow,
): Promise<ForecastSnapshot> {
  const flow = preloaded ?? (await loadFlow(userClient));
  const forecast = roundDeep(
    forecastCashflow({ balance: flow.balance, transactions: flow.transactions }),
  );
  const backtest = forecast.insufficient
    ? null
    : backtestForecast({ balance: flow.balance, transactions: flow.transactions }, 30);

  const row = {
    user_id: userId,
    horizon_days: forecast.horizonDays,
    projected_balance: forecast.series,
    risk_flags: forecast.risks,
    details: roundDeep({
      insufficient: forecast.insufficient,
      confidence: forecast.confidence,
      today: forecast.today,
      startBalance: forecast.startBalance,
      safetyBuffer: forecast.safetyBuffer,
      lowest: forecast.lowest,
      firstRiskDay: forecast.firstRiskDay,
      expectedIncome: forecast.expectedIncome,
      expectedBills: forecast.expectedBills,
      recurring: forecast.recurring.map((r) => ({
        counterparty: r.counterparty,
        channel: r.channel,
        direction: r.direction,
        cadence: r.cadence,
        expectedAmount: r.expectedAmount,
        amountStable: r.amountStable,
        nextDay: r.nextDay,
      })),
      backtest,
    }),
  };

  const admin = adminClient();
  const { data: latest } = await admin
    .from("forecasts")
    .select("id,projected_balance,risk_flags,details")
    .eq("user_id", userId)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const same =
    latest &&
    canonical(latest.projected_balance) === canonical(row.projected_balance) &&
    canonical(latest.risk_flags) === canonical(row.risk_flags) &&
    canonical(latest.details) === canonical(row.details);

  if (same) {
    await admin
      .from("forecasts")
      .update({ computed_at: new Date().toISOString() })
      .eq("id", latest.id);
  } else {
    const { error } = await admin.from("forecasts").insert(row);
    if (error) throw error;
  }
  return { forecast, backtest };
}
