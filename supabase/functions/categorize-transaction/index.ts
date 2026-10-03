import { z } from "zod";
import {
  categorize,
  isCategoryKey,
  normalizeKeyword,
  type Channel,
  type UserRule,
} from "@compass/shared";
import { aiCategorize, type AiItem } from "../_shared/ai-categorize.ts";
import { authenticate, corsHeaders, json } from "../_shared/http.ts";
import { takeSlot } from "../_shared/limits.ts";
import { startCall } from "../_shared/monitor.ts";

/** At most this many calls per user in this many minutes (each can reach the model). */
const RATE_LIMIT = 20;
const RATE_WINDOW_MINUTES = 10;

const bodySchema = z.object({ transaction_ids: z.array(z.string().uuid()).min(1).max(50) });

/**
 * Categorizes the caller's own transactions that the client-side rules could not place.
 * Re-runs the rules first (a user rule may have appeared), then asks the AI for the rest, and files
 * anything still unknown under "Other" flagged for review. Hand-corrected transactions are never touched.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { client, user } = auth;

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "invalid_body" }, 400);

  if (!(await takeSlot(user.id, "categorize_slot", RATE_LIMIT, RATE_WINDOW_MINUTES))) {
    return json({ error: "rate_limited", retry_after_minutes: RATE_WINDOW_MINUTES }, 429);
  }

  const [txRes, catRes, ruleRes] = await Promise.all([
    client
      .from("transactions")
      .select("id,direction,channel,counterparty,note,category_source")
      .in("id", body.data.transaction_ids)
      .neq("category_source", "user"),
    client.from("categories").select("id,key"),
    client.from("category_rules").select("keyword,category_id"),
  ]);
  if (txRes.error || catRes.error || ruleRes.error || !catRes.data) {
    return json({ error: "load_failed" }, 500);
  }

  const idByKey = new Map<string, number>(
    catRes.data.map((c) => [c.key as string, c.id as number]),
  );
  const keyById = new Map<number, string>(
    catRes.data.map((c) => [c.id as number, c.key as string]),
  );
  const userRules: UserRule[] = (ruleRes.data ?? []).flatMap((r) => {
    const key = keyById.get(r.category_id as number);
    return key && isCategoryKey(key) ? [{ keyword: r.keyword as string, category: key }] : [];
  });

  type Row = {
    id: string;
    direction: "in" | "out";
    channel: Channel;
    counterparty: string;
    note: string;
  };
  const rows = (txRes.data ?? []) as unknown as Row[];
  const unknown: Row[] = [];
  let updated = 0;

  for (const row of rows) {
    const result = categorize(row, userRules);
    if (result) {
      await client
        .from("transactions")
        .update({
          category_id: idByKey.get(result.category),
          category_source: result.source,
          needs_review: false,
        })
        .eq("id", row.id);
      updated++;
    } else {
      unknown.push(row);
    }
  }

  const items = new Map<string, AiItem>();
  for (const row of unknown) {
    const id = normalizeKeyword(row.counterparty) || row.id;
    if (!items.has(id)) {
      items.set(id, {
        id,
        counterparty: row.counterparty,
        note: row.note,
        channel: row.channel,
        direction: row.direction,
      });
    }
  }
  // one monitoring event per request that reaches the model; a request whose items were not all
  // labelled still succeeded for the person (they go to review), so it is a fallback, not an error
  const call = items.size > 0 ? startCall("categorize-transaction") : null;
  const labels = await aiCategorize([...items.values()], call ?? undefined);
  if (call) {
    if (labels.size < items.size) call.fallback();
    call.end();
  }

  for (const row of unknown) {
    const label = labels.get(normalizeKeyword(row.counterparty) || row.id);
    await client
      .from("transactions")
      .update(
        label
          ? { category_id: idByKey.get(label), category_source: "ai", needs_review: false }
          : { category_id: idByKey.get("other"), category_source: "rule", needs_review: true },
      )
      .eq("id", row.id);
    updated++;
  }

  return json({ updated, ai_labelled: labels.size });
});
