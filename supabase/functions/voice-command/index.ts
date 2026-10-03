import { z } from "zod";
import { addDays, dhakaDay, validateCommand, type Command } from "@compass/shared";
import { authenticate, corsHeaders, json } from "../_shared/http.ts";
import { parseVoiceCommand } from "../_shared/voice-parse.ts";
import { auditVoice, guardVoice } from "../_shared/voice.ts";
import { startCall } from "../_shared/monitor.ts";

const bodySchema = z.object({
  text: z.string().trim().min(1).max(500),
  language: z.enum(["bn", "en"]).optional(),
});

const MAX_CANDIDATES = 5;

type Candidate = {
  id: string;
  amount: number;
  direction: "in" | "out";
  counterparty: string;
  occurred_at: string;
  category_id: number | null;
};

/**
 * Payments the person might mean by "remove ...". Looked up here (with their own rights, so only
 * their own rows) and returned for them to pick from. The model never sees these rows or their ids.
 */
async function findCandidates(
  client: Parameters<typeof guardVoice>[0],
  command: Extract<Command, { intent: "delete_transaction" }>,
): Promise<Candidate[]> {
  let query = client
    .from("transactions")
    .select("id,amount,direction,counterparty,occurred_at,category_id")
    .order("occurred_at", { ascending: false })
    .limit(MAX_CANDIDATES);

  if (command.direction) query = query.eq("direction", command.direction);
  if (command.which === "last") {
    // "my last payment": the most recent spending unless they said otherwise
    if (!command.direction) query = query.eq("direction", "out");
  } else {
    if (command.amount !== null) query = query.eq("amount", command.amount);
    if (command.merchant) {
      const safe = command.merchant.replace(/[%_,()]/g, " ").trim();
      if (safe) query = query.ilike("counterparty", `%${safe}%`);
    }
    if (command.date) {
      // a Bangladesh calendar day is [00:00, 24:00) at UTC+6
      const start = new Date(`${command.date}T00:00:00+06:00`).toISOString();
      const end = new Date(`${addDays(command.date, 1)}T00:00:00+06:00`).toISOString();
      query = query.gte("occurred_at", start).lt("occurred_at", end);
    }
  }
  const { data } = await query;
  return (data ?? []).map((t) => ({ ...t, amount: Number(t.amount) })) as Candidate[];
}

/**
 * Turns one sentence into a validated command, or says why not. The model only classifies and
 * fills slots; the amount must be one the person actually said, dates and categories are resolved
 * by code, and nothing is executed here: the app shows a confirmation card and runs the existing
 * code only after the person taps. Writes an audit entry (kind and outcome, never the words).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { client, user } = auth;

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "invalid_body" }, 400);
  const text = body.data.text;

  const blocked = await guardVoice(client, user.id, "voice_command");
  if (blocked) return blocked;
  if (!Deno.env.get("OPENAI_API_KEY")) return json({ error: "unavailable" }, 503);

  const today = dhakaDay(new Date());
  const { data: goalRows } = await client.from("goals").select("id,title").eq("status", "active");
  const goals = (goalRows ?? []).map((g) => ({ id: g.id as string, title: g.title as string }));

  const call = startCall("voice-command", body.data.language);
  const raw = await parseVoiceCommand(text, today, goals, call);
  if (raw === null) {
    call.reason("model_failed");
    call.end("error");
    await auditVoice(client, user.id, "voice_command", { ok: false, reason: "model_failed" });
    return json({ error: "parse_failed" }, 502);
  }

  const result = validateCommand(raw, { transcript: text, today, goals });
  if (!result.ok) {
    // the validator stopped the model's output: a safety check doing its job, not a failure
    call.reason(`check_${result.reason}`);
    call.end();
    await auditVoice(client, user.id, "voice_command", { ok: false, reason: result.reason });
    return json({ status: "rejected", reason: result.reason, transcript: text });
  }
  call.end();

  const command = result.command;
  const candidates =
    command.intent === "delete_transaction" ? await findCandidates(client, command) : undefined;
  await auditVoice(client, user.id, "voice_command", { ok: true, intent: command.intent });
  return json({ status: "ok", command, candidates, transcript: text });
});
