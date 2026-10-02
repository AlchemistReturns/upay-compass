import type { SupabaseClient } from "@supabase/supabase-js";
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
import { aiCategorize, type AiItem } from "./ai-categorize.ts";
import { refreshHealthScore } from "./health.ts";
import { refreshForecast } from "./flow.ts";

const BATCH_SIZE = 200;

export type IngestSummary = {
  received: number;
  rejected: number;
  inserted: number;
  duplicates: number;
  ai_categorized: number;
  needs_review: number;
};

export type IngestResult =
  | { ok: true; summary: IngestSummary; healthScore: number | null }
  | { ok: false; status: number; error: string; detail?: string };

/**
 * Loads a persona's simulated upay history for one user: validate, categorize (rules, then AI for
 * unknown merchants), insert idempotently, then refresh the health score and forecast.
 * An optional `seed` gives a different (still deterministic) history, used for the demo cohort.
 * `client` must act as that user (their JWT), so row level security applies.
 */
export async function ingestForUser(
  client: SupabaseClient,
  userId: string,
  persona: "student" | "gig" | "salaried",
  seed?: string,
): Promise<IngestResult> {
  // 1. Pull from the feed (the simulated upay adapter; a real feed implements the same interface).
  const feed = new SimulatedFeed(persona, seed ? { seed } : {});
  const raw = await feed.getTransactions(userId, new Date(0));

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
      user_id: userId,
      action: "ingest_rejected",
      entity: "transaction",
      detail: { count: rejected.length, sample: rejected.slice(0, 5) },
    });
  }

  // 3. Categorize: user rules, channel, keywords. Unknowns go to the AI fallback.
  const [{ data: categories, error: catErr }, { data: ruleRows, error: ruleErr }] =
    await Promise.all([
      client.from("categories").select("id,key"),
      client.from("category_rules").select("keyword,category_id").eq("user_id", userId),
    ]);
  if (catErr || ruleErr || !categories) return { ok: false, status: 500, error: "load_failed" };

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
    user_id: userId,
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
    if (error) return { ok: false, status: 500, error: "insert_failed", detail: error.message };
    inserted += data?.length ?? 0;
  }

  await client.from("profiles").update({ opening_balance: feed.openingBalance }).eq("id", userId);

  const summary = {
    received: raw.length,
    rejected: rejected.length,
    inserted,
    duplicates: rows.length - inserted,
    ai_categorized: aiCount,
    needs_review: reviewCount,
  };
  await client.from("audit_log").insert({
    user_id: userId,
    action: "ingest",
    entity: "transaction",
    detail: { persona: persona, ...summary },
  });

  // Best effort: a failed score refresh must not fail the ingestion itself.
  const health = await refreshHealthScore(client, userId).catch(() => null);
  await refreshForecast(client, userId).catch(() => null);

  return { ok: true, summary, healthScore: health?.score ?? null };
}
