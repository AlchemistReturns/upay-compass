import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FEED_ERROR_STATUS,
  FeedError,
  addDays,
  categorizeInStages,
  dhakaDay,
  isCategoryKey,
  mlMode,
  normalizeKeyword,
  transactionSchema,
  type CategoryKey,
  type FeedContext,
  type Transaction,
  type TransactionFeed,
  type UserRule,
} from "@compass/shared";
import { SimulatedFeed } from "@compass/upay-sim";
import { aiCategorize, type AiItem } from "./ai-categorize.ts";
import { adminClient } from "./http.ts";
import { startCall } from "./monitor.ts";
import { refreshHealthScore } from "./health.ts";
import { refreshForecast } from "./flow.ts";
import { refreshReadiness } from "./readiness.ts";

const BATCH_SIZE = 200;

export type IngestSummary = {
  source: string;
  received: number;
  rejected: number;
  inserted: number;
  duplicates: number;
  ai_categorized: number;
  needs_review: number;
  /** Labelled by the on-device pattern model (ML_CATEGORIZE=on). */
  model_categorized?: number;
  /** Shadow mode: payments sent to the AI that the model also had an answer for, and how often they agreed. */
  model_shadow?: { compared: number; agreed: number };
};

export type IngestResult =
  | { ok: true; summary: IngestSummary; healthScore: number | null }
  | { ok: false; status: number; error: string; detail?: string };

/** Overlap, in days, when syncing a live feed, so late-posting transactions are not missed. */
const SYNC_OVERLAP_DAYS = 3;

/**
 * Where a live feed should resume: shortly before the newest transaction already imported from it.
 * Re-pulling the overlap is harmless because external_id makes inserts idempotent.
 */
async function lastSyncSince(
  client: SupabaseClient,
  userId: string,
  prefix: string,
): Promise<Date> {
  const { data } = await client
    .from("transactions")
    .select("occurred_at")
    .eq("user_id", userId)
    .like("external_id", `${prefix}%`)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return new Date(0);
  return new Date(`${addDays(dhakaDay(data.occurred_at as string), -SYNC_OVERLAP_DAYS)}T00:00:00Z`);
}

/** Demo path: loads a persona's simulated history (an optional `seed` gives a different one). */
export function ingestForUser(
  client: SupabaseClient,
  userId: string,
  persona: "student" | "gig" | "salaried",
  seed?: string,
): Promise<IngestResult> {
  const feed = new SimulatedFeed(persona, seed ? { seed } : {});
  return ingestFromFeed(client, { userId, phone: null }, feed, { persona });
}

/**
 * Loads one person's transactions from any TransactionFeed: validate, categorize (rules, then AI
 * for unknown merchants), insert idempotently, then refresh the health score and forecast. The
 * pipeline knows nothing about where the records came from; the feed contract is the only seam.
 * `client` must act as that user (their JWT), so row level security applies.
 */
export async function ingestFromFeed(
  client: SupabaseClient,
  ctx: FeedContext,
  feed: TransactionFeed,
  meta: Record<string, unknown> = {},
): Promise<IngestResult> {
  const userId = ctx.userId;

  // 1. Pull from the feed. A live API resumes where the last sync stopped; everything else is a full pull.
  let raw: unknown[];
  let openingBalance: number | null;
  try {
    const since =
      feed.id === "upay_api" ? await lastSyncSince(client, userId, "upay-") : new Date(0);
    const batch = await feed.pull(ctx, since);
    raw = batch.records;
    openingBalance = batch.openingBalance;
  } catch (e) {
    if (e instanceof FeedError) {
      return { ok: false, status: FEED_ERROR_STATUS[e.code], error: e.code, detail: e.message };
    }
    throw e;
  }

  // 2. Validate. Malformed records are rejected, logged to audit_log, and skipped.
  const valid: Transaction[] = [];
  const rejected: { id: unknown; issues: string[] }[] = [];
  for (const item of raw) {
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
    source: "rule" | "user" | "ai" | "model";
    review: boolean;
  };
  const labelled: Labelled[] = [];
  const unknown: Transaction[] = [];
  // ML_CATEGORIZE = on (default) | shadow | off. Off leaves the order rules, then AI, as it was.
  const modelMode = mlMode("categorize", { ML_CATEGORIZE: Deno.env.get("ML_CATEGORIZE") });
  const shadowGuess = new Map<string, string>();
  let modelCount = 0;
  const modelCall = modelMode === "off" ? null : startCall("ml-categorize");
  modelCall?.model("name_patterns");
  for (const tx of valid) {
    const staged = categorizeInStages(tx, userRules, modelMode);
    if (staged.labelled) {
      const { category, source, review } = staged.labelled;
      labelled.push({ tx, category, source, review });
      if (source === "model") modelCount++;
    } else {
      unknown.push(tx);
      if (staged.shadow) shadowGuess.set(tx.id, staged.shadow);
    }
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
  const shadow = { compared: 0, agreed: 0 };
  for (const tx of unknown) {
    const id = normalizeKeyword(tx.counterparty) || `${tx.channel}:${tx.direction}`;
    const label = aiLabels.get(id);
    const guess = shadowGuess.get(tx.id);
    if (label && guess) {
      shadow.compared++;
      if (guess === label) shadow.agreed++;
    }
    if (label) {
      labelled.push({ tx, category: label, source: "ai", review: false });
      aiCount++;
    } else {
      // AI unavailable or unsure: file under Other and queue for the user to review.
      labelled.push({ tx, category: "other", source: "rule", review: true });
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
    is_simulated: feed.simulated,
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

  // Server-controlled column: written with the service role, after the caller was verified.
  // Only when the source knows it: a feed that does not (null) leaves the stored balance alone.
  if (openingBalance !== null) {
    await adminClient()
      .from("profiles")
      .update({ opening_balance: openingBalance })
      .eq("id", userId);
  }

  modelCall?.end();
  const summary: IngestSummary = {
    source: feed.id,
    received: raw.length,
    rejected: rejected.length,
    inserted,
    duplicates: rows.length - inserted,
    ai_categorized: aiCount,
    needs_review: labelled.filter((l) => l.review).length,
    ...(modelMode === "on" ? { model_categorized: modelCount } : {}),
    ...(modelMode === "shadow" ? { model_shadow: shadow } : {}),
  };
  await client.from("audit_log").insert({
    user_id: userId,
    action: "ingest",
    entity: "transaction",
    detail: { ...meta, ...summary },
  });

  // Best effort: a failed score refresh must not fail the ingestion itself.
  const health = await refreshHealthScore(client, userId).catch(() => null);
  await refreshForecast(client, userId).catch(() => null);
  await refreshReadiness(client, userId).catch(() => null);

  return { ok: true, summary, healthScore: health?.score ?? null };
}
