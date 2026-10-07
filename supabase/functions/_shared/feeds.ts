import { z } from "zod";
import {
  CHANNELS,
  FeedError,
  MAX_STATEMENT_BYTES,
  type Channel,
  type TransactionFeed,
} from "@compass/shared";
import { SimulatedFeed } from "@compass/upay-sim";
import { StatementFeed } from "@compass/upay-statement";
import { UpayApiFeed, type FieldMap, type ServiceMap } from "@compass/upay-api";

/**
 * The one place that knows which feeds exist. To plug in a new source: add a branch to
 * `feedRequestSchema`, return its feed from `buildFeed`, and nothing else in the pipeline changes.
 * See docs/integration/upay-adapter.md.
 */
export const feedRequestSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("simulated"),
    persona: z.enum(["student", "gig", "salaried"]),
  }),
  z.object({
    source: z.literal("statement_csv"),
    csv: z.string().min(1).max(MAX_STATEMENT_BYTES),
    /** what the wallet held before the first row, if the person knows and the file has no balance column */
    openingBalance: z.number().finite().nonnegative().optional(),
  }),
  // Pulls from upay's partner API for the signed-in person's verified phone number.
  z.object({ source: z.literal("upay_api") }),
]);
export type FeedRequest = z.infer<typeof feedRequestSchema>;

/** Optional JSON from an env var (field / service map overrides); a bad value is ignored loudly. */
function jsonEnv<T>(name: string): Partial<T> | undefined {
  const raw = Deno.env.get(name);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Partial<T>) : undefined;
  } catch {
    console.error(`${name} is not valid JSON; ignoring it`);
    return undefined;
  }
}

/** A service map from the environment, keeping only entries that name a real Compass channel. */
function serviceMapEnv(): ServiceMap | undefined {
  const raw = jsonEnv<Record<string, unknown>>("UPAY_API_SERVICE_MAP");
  if (!raw) return undefined;
  const map: ServiceMap = {};
  for (const [service, channel] of Object.entries(raw)) {
    if (typeof channel === "string" && (CHANNELS as readonly string[]).includes(channel)) {
      map[service.toUpperCase()] = channel as Channel;
    } else
      console.error(`UPAY_API_SERVICE_MAP: "${service}" does not map to a channel; ignoring it`);
  }
  return map;
}

/** Whether the live upay feed has credentials (the UI uses this to show or hide the option). */
export function upayApiConfigured(): boolean {
  return Boolean(Deno.env.get("UPAY_API_BASE_URL") && Deno.env.get("UPAY_API_KEY"));
}

/** Throws FeedError("not_configured") when a live source has no credentials set. */
export function buildFeed(request: FeedRequest, opts: { seed?: string } = {}): TransactionFeed {
  switch (request.source) {
    case "simulated":
      return new SimulatedFeed(request.persona, opts.seed ? { seed: opts.seed } : {});
    case "statement_csv":
      return new StatementFeed(request.csv, { openingBalance: request.openingBalance ?? null });
    case "upay_api": {
      const baseUrl = Deno.env.get("UPAY_API_BASE_URL");
      const apiKey = Deno.env.get("UPAY_API_KEY");
      if (!baseUrl || !apiKey)
        throw new FeedError("not_configured", "UPAY_API_BASE_URL / UPAY_API_KEY not set");
      return new UpayApiFeed({
        baseUrl,
        apiKey,
        fields: jsonEnv<FieldMap>("UPAY_API_FIELD_MAP"),
        services: serviceMapEnv(),
      });
    }
  }
}
