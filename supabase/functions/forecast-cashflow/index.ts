import { authenticate, corsHeaders, json } from "../_shared/http.ts";
import { refreshForecast } from "../_shared/flow.ts";

/**
 * Recomputes the caller's 30-day cashflow forecast. The app calls it when the forecast screen opens
 * with a snapshot older than 6 hours; the coach and nudge rules use the same helper.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  try {
    const { forecast, backtest } = await refreshForecast(auth.client, auth.user.id);
    return json({
      insufficient: forecast.insufficient,
      confidence: forecast.confidence,
      firstRiskDay: forecast.firstRiskDay,
      riskDays: forecast.risks.length,
      lowest: forecast.lowest,
      backtest,
    });
  } catch (e) {
    return json(
      { error: "forecast_failed", detail: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});
