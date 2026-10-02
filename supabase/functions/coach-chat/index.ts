import { z } from "zod";
import {
  buildCoachContext,
  canAfford,
  detectAffordIntent,
  detectReplyLanguage,
  fallbackReply,
} from "@compass/shared";
import { adminClient, authenticate, corsHeaders, json } from "../_shared/http.ts";
import { loadFlow, refreshForecast } from "../_shared/flow.ts";
import {
  HISTORY_MESSAGES,
  dataMessage,
  loadCoachInput,
  streamChat,
  systemPrompt,
  type ChatMessage,
} from "../_shared/coach.ts";

const bodySchema = z.object({ message: z.string().trim().min(1).max(1000) });

/** At most this many questions per user in this many minutes. */
const RATE_LIMIT = 20;
const RATE_WINDOW_MINUTES = 10;
const OVERALL_TIMEOUT_MS = 60_000;

/**
 * AI coach. Verifies the caller, builds a compact summary of their own numbers (no phone, names or
 * transaction list), computes any "can I afford X?" answer in code, then streams the model's
 * explanation back as server-sent events and stores both messages. If the model is unavailable it
 * answers from a template built from the same numbers.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { client, user } = auth;

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "invalid_body" }, 400);
  const message = body.data.message;
  const debug = req.headers.get("x-coach-debug") === "1";

  const admin = adminClient();

  // Rate limit per user.
  const since = new Date(Date.now() - RATE_WINDOW_MINUTES * 60_000).toISOString();
  const { count } = await admin
    .from("coach_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("role", "user")
    .gte("created_at", since);
  if ((count ?? 0) >= RATE_LIMIT) {
    return json({ error: "rate_limited", retry_after_minutes: RATE_WINDOW_MINUTES }, 429);
  }

  let contextInput;
  let forecast;
  try {
    const flow = await loadFlow(client);
    ({ forecast } = await refreshForecast(client, user.id, flow));
    const loaded = await loadCoachInput(client, forecast, flow.balance);
    if (!loaded.consent) return json({ error: "consent_required" }, 403);
    // Answer in the language of the question; the app language only breaks ties.
    contextInput = {
      ...loaded.input,
      language: detectReplyLanguage(message, loaded.input.language),
    };
  } catch (e) {
    return json(
      { error: "context_failed", detail: e instanceof Error ? e.message : String(e) },
      500,
    );
  }

  // "Can I afford X?" is decided by code; the model only explains it.
  const intent = detectAffordIntent(message);
  const affordability = intent
    ? canAfford(intent.amount, contextInput.balance, forecast)
    : undefined;
  const context = buildCoachContext(contextInput, affordability);

  const { data: past } = await client
    .from("coach_messages")
    .select("role,content")
    .order("created_at", { ascending: false })
    .limit(HISTORY_MESSAGES);
  const history: ChatMessage[] = (past ?? [])
    .reverse()
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content as string }));

  await admin.from("coach_messages").insert({ user_id: user.id, role: "user", content: message });

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(context.language) },
    { role: "system", content: dataMessage(context) },
    ...history,
    { role: "user", content: message },
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), OVERALL_TIMEOUT_MS);

      let reply = "";
      let usedFallback = false;
      try {
        reply = await streamChat(messages, (delta) => send({ delta }), abort.signal);
      } catch (e) {
        console.error("coach model failed:", e instanceof Error ? e.message : e);
        if (!reply) {
          usedFallback = true;
          reply = fallbackReply(context);
          send({ delta: reply, fallback: true });
        }
      } finally {
        clearTimeout(timer);
      }

      await admin
        .from("coach_messages")
        .insert({ user_id: user.id, role: "assistant", content: reply });
      // The summary is the user's own numbers. With the debug header they can see exactly what the
      // model was shown (used by the evaluation script to check that every figure is grounded).
      send({
        done: true,
        fallback: usedFallback,
        affordability: affordability?.verdict ?? null,
        ...(debug ? { context } : {}),
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
