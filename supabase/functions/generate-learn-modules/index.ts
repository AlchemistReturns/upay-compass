import { z } from "zod";
import {
  LEARN_RATE_LIMIT,
  LEARN_RATE_WINDOW_MINUTES,
  buildLearnSignals,
  generateLearnModule,
  moduleExpiry,
  planLearnRefresh,
  type StoredModuleMeta,
} from "@compass/shared";
import { adminClient, authenticate, corsHeaders, json } from "../_shared/http.ts";
import { takeSlot } from "../_shared/limits.ts";
import { loadLearnSignalInput, makeOpenAiLearnClient } from "../_shared/learn.ts";
import { startCall } from "../_shared/monitor.ts";

const bodySchema = z.object({ language: z.enum(["bn", "en"]).optional() });

const COLUMNS =
  "id,topic_id,language,content,facts,reason_id,generated_at,expires_at,completed_at,quick_check_score,feedback,dismissed_at";

/**
 * "Made for you" learn modules (F28). Code picks the topics from the person's own signals; the
 * model only writes each module from a small facts object; the validator checks every module
 * before it is stored. Only validated modules are ever stored or returned.
 *
 * Steps: verify the caller, require coach consent (the same consent: a short summary of their
 * numbers goes to OpenAI), rate-limit, load signals, plan, reuse fresh modules, write the missing
 * ones (one model call each, one retry on rejection), store them with the service role, and return
 * the person's modules. If the model is unavailable, nothing new is written and the reason says so.
 * The audit entry holds counts only, never content.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { client, user } = auth;

  const body = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return json({ error: "invalid_body" }, 400);

  const now = new Date();
  let loaded;
  try {
    loaded = await loadLearnSignalInput(client, now);
  } catch (e) {
    return json(
      { error: "context_failed", detail: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
  if (!loaded.consent) return json({ error: "consent_required" }, 403);
  const language = body.data.language ?? loaded.language;

  // the slot is taken before the slow work, so parallel requests are counted (shared limiter)
  if (!(await takeSlot(user.id, "learn_slot", LEARN_RATE_LIMIT, LEARN_RATE_WINDOW_MINUTES))) {
    return json({ error: "rate_limited", retry_after_minutes: LEARN_RATE_WINDOW_MINUTES }, 429);
  }

  const { data: storedRows, error: storedError } = await client
    .from("personalized_modules")
    .select(COLUMNS)
    .eq("language", language);
  if (storedError) return json({ error: "context_failed" }, 500);
  const stored = (storedRows ?? []) as (StoredModuleMeta & Record<string, unknown>)[];

  const signals = buildLearnSignals(loaded.input);
  const plan = planLearnRefresh(signals, stored, now);

  const admin = adminClient();
  // one monitoring event per request (tokens add up over its model calls)
  const call = startCall("generate-learn-modules", language);
  const learnClient = makeOpenAiLearnClient(call);
  const showIds: string[] = [];
  let generated = 0;
  let rejected = 0;
  let unavailable = false;

  for (const planned of plan.modules) {
    if (planned.reuse) {
      showIds.push(planned.reuse.id);
      continue;
    }
    if (unavailable) {
      if (planned.fallback) showIds.push(planned.fallback.id);
      continue;
    }
    const result = await generateLearnModule(
      planned.pick.topic,
      planned.facts,
      language,
      learnClient,
    );
    if (!result.ok) {
      if (result.unavailable) unavailable = true;
      else rejected++;
      // never show rejected text; an older validated module for the topic may stand in
      if (planned.fallback) showIds.push(planned.fallback.id);
      continue;
    }
    const { data: saved, error } = await admin
      .from("personalized_modules")
      .upsert(
        {
          user_id: user.id,
          topic_id: planned.pick.topic.id,
          language,
          content: result.content,
          facts: planned.facts,
          reason_id: planned.pick.reason,
          generated_at: now.toISOString(),
          expires_at: moduleExpiry(now),
          completed_at: null,
          quick_check_score: null,
          feedback: null,
          dismissed_at: null,
        },
        { onConflict: "user_id,topic_id,language" },
      )
      .select("id")
      .single();
    if (error || !saved) continue;
    generated++;
    showIds.push(saved.id as string);
  }
  showIds.push(...plan.finished.map((r) => r.id));

  // the validator stopped at least one module, or the model was unavailable
  if (rejected > 0) call.reason("check_rejected_module");
  if (unavailable) {
    call.reason("model_unavailable");
    call.fallback();
  }
  call.end();

  await client.from("audit_log").insert({
    user_id: user.id,
    action: "learn_generate",
    entity: "learn",
    detail: {
      language,
      picked: plan.modules.length,
      reused: plan.modules.filter((m) => m.reuse).length,
      generated,
      rejected,
      unavailable,
      finished: plan.finished.length,
    },
  });

  const { data: modules } = showIds.length
    ? await client.from("personalized_modules").select(COLUMNS).in("id", showIds)
    : { data: [] };
  const order = new Map(showIds.map((id, i) => [id, i]));
  const sorted = (modules ?? []).sort(
    (a, b) => (order.get(a.id as string) ?? 0) - (order.get(b.id as string) ?? 0),
  );

  return json({
    status: unavailable ? "model_unavailable" : rejected ? "partial" : "ok",
    modules: sorted,
  });
});
