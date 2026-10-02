import { z } from "zod";
import {
  categorize,
  isCategoryKey,
  normalizeKeyword,
  transactionSchema,
  type CategoryKey,
  type Transaction,
  type UserRule,
} from "@compass/shared";
import { SimulatedFeed } from "@compass/upay-sim";
import { aiCategorize, type AiItem } from "../_shared/ai-categorize.ts";
import { authenticate, corsHeaders, json } from "../_shared/http.ts";

const bodySchema = z.object({ persona: z.enum(["student", "gig", "salaried"]) });
const BATCH_SIZE = 200;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { client, user } = auth;

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return json({ error: "invalid_body" }, 400);

  // 1. Pull from the feed (the simulated upay adapter; a real feed implements the same interface).
  const feed = new SimulatedFeed(body.data.persona);
  const raw = await feed.getTransactions(user.id, new Date(0));

  // 2. Validate. Malformed records are rejected, logged to audit_log, and skipped.
  const valid: Transaction[] = [];
  const rejected: { id: unknown; issues: string[] }[] = [];
  for (const item of raw as unknown[]) {
    const parsed = transactionSchema.safeParse(item);
    if (parsed.success) valid.push(parsed.data);
    else {
      rejected.push({
        id: (item as { id?: unknown })?.id,
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
  }
  if (rejected.length > 0) {
    await client.from("audit_log").insert({
      user_id: user.id,
      action: "ingest_rejected",
      entity: "transaction",
      detail: { count: rejected.length, sample: rejected.slice(0, 5) },
    });
  }

  // 3. Categorize: user rules, channel, keywords. Unknowns go to the AI fallback.
  const [{ data: categories, error: catErr }, { data: ruleRows, error: ruleErr }] =
    await Promise.all([
      client.from("categories").select("id,key"),
      client.from("category_rules").select("keyword,category_id"),
    ]);
  if (catErr || ruleErr || !categories) return json({ error: "load_failed" }, 500);

  const idByKey = new Map<string, number>(categories.map((c) => [c.key as string, c.id as number]));
  const keyById = new Map<number, string>(categories.map((c) => [c.id as number, c.key as string]));
  const userRules: UserRule[] = (ruleRows ?? []).flatMap((r) => {
    const key = keyById.get(r.category_id as number);
    return key && isCategoryKey(key) ? [{ keyword: r.keyword as string, category: key }] : [];
  });

  type Labelled = {
    tx: Transaction;
    category: CategoryKey;
    source: "rule" | "user" | "ai";
    review: boolean;
  };
  const labelled: Labelled[] = [];
  const unknown: Transaction[] = [];
  for (const tx of valid) {
    const result = categorize(tx, userRules);
    if (result)
      labelled.push({ tx, category: result.category, source: result.source, review: false });
    else unknown.push(tx);
  }

  // One AI question per distinct merchant, not per transaction.
  const aiItems = new Map<string, AiItem>();
  for (const tx of unknown) {
    const id = normalizeKeyword(tx.counterparty) || `${tx.channel}:${tx.direction}`;
    if (!aiItems.has(id)) {
      aiItems.set(id, {
        id,
        counterparty: tx.counterparty,
        note: tx.note,
        channel: tx.channel,
        direction: tx.direction,
      });
    }
  }
  const aiLabels = await aiCategorize([...aiItems.values()]);
  let aiCount = 0;
  let reviewCount = 0;
  for (const tx of unknown) {
    const id = normalizeKeyword(tx.counterparty) || `${tx.channel}:${tx.direction}`;
    const label = aiLabels.get(id);
    if (label) {
      labelled.push({ tx, category: label, source: "ai", review: false });
      aiCount++;
    } else {
      // AI unavailable or unsure: file under Other and queue for the user to review.
      labelled.push({ tx, category: "other", source: "rule", review: true });
      reviewCount++;
    }
  }

  // 4. Insert in batches. external_id makes re-ingesting the same feed a no-op.
  const rows = labelled.map(({ tx, category, source, review }) => ({
    user_id: user.id,
    external_id: tx.id,
    amount: tx.amount,
    direction: tx.direction,
    channel: tx.channel,
    counterparty: tx.counterparty,
    note: tx.note,
    category_id: idByKey.get(category) ?? idByKey.get("other"),
    category_source: source,
    needs_review: review,
    is_simulated: true,
    occurred_at: tx.occurred_at,
  }));

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const { data, error } = await client
      .from("transactions")
      .upsert(rows.slice(i, i + BATCH_SIZE), {
        onConflict: "user_id,external_id",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) return json({ error: "insert_failed", detail: error.message }, 500);
    inserted += data?.length ?? 0;
  }

  await client.from("profiles").update({ opening_balance: feed.openingBalance }).eq("id", user.id);

  const summary = {
    received: raw.length,
    rejected: rejected.length,
    inserted,
    duplicates: rows.length - inserted,
    ai_categorized: aiCount,
    needs_review: reviewCount,
  };
  await client.from("audit_log").insert({
    user_id: user.id,
    action: "ingest",
    entity: "transaction",
    detail: { persona: body.data.persona, ...summary },
  });

  return json(summary);
});
