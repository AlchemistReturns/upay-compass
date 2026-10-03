import { adminClient } from "./http.ts";

/**
 * Monitoring for the functions that call OpenAI. One row in `model_events` per request: status,
 * duration, model name, token counts, whether a fallback was used and a reason code. Never any
 * content (no prompts, replies, transcripts, names, phone numbers or user ids).
 *
 * It is fire-and-forget by design:
 *  - `end()` returns immediately; the insert is handed to `EdgeRuntime.waitUntil`, which keeps the
 *    function instance alive until the write finishes WITHOUT holding up the response. Where that
 *    is not available (local tests) the promise is simply left detached. Either way nothing awaits it.
 *  - Every step is wrapped in try/catch and the write has its own short timeout, so a failure or a
 *    slow database can neither throw into, delay, nor change the behaviour of a user request.
 *
 * Reason codes: `check_*` means a validator stopped or changed the model's output (a safety check
 * doing its job); anything else is a technical reason (http_429, timeout, model_failed ...).
 */

export type CallMeter = {
  /** the model that answered (from the env setting actually used) */
  model(name: string | null | undefined): void;
  /** the `usage` object of an OpenAI response; adds up over several calls */
  usage(raw: unknown): void;
  language(lang: string | null | undefined): void;
  /** first reason wins; anything that is not a short snake_case code is stored as "error" */
  reason(code: string): void;
  /** the app used its non-AI path (template reply, review flag, no new lesson) */
  fallback(): void;
  /** finishes the call and records it; safe to call more than once */
  end(status?: "ok" | "error"): void;
};

type RuntimeWithWaitUntil = { waitUntil?: (p: Promise<unknown>) => void };

const WRITE_TIMEOUT_MS = 3000;

function count(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
}

export function startCall(functionName: string, language?: string | null): CallMeter {
  const started = Date.now();
  let model: string | null = null;
  let tokensIn: number | null = null;
  let tokensOut: number | null = null;
  let lang: string | null = language === "bn" || language === "en" ? language : null;
  let reason: string | null = null;
  let fallback = false;
  let done = false;

  return {
    model(name) {
      if (typeof name === "string" && name) model = name.slice(0, 64);
    },
    usage(raw) {
      try {
        const u = (raw ?? {}) as Record<string, unknown>;
        // chat completions say prompt/completion tokens, the audio endpoints say input/output
        const i = count(u.prompt_tokens ?? u.input_tokens);
        const o = count(u.completion_tokens ?? u.output_tokens);
        if (i !== null) tokensIn = (tokensIn ?? 0) + i;
        if (o !== null) tokensOut = (tokensOut ?? 0) + o;
      } catch {
        // monitoring never throws
      }
    },
    language(l) {
      if (l === "bn" || l === "en") lang = l;
    },
    reason(code) {
      if (reason !== null) return;
      reason = /^[a-z0-9_]{1,40}$/.test(code) ? code : "error";
    },
    fallback() {
      fallback = true;
    },
    end(status = "ok") {
      if (done) return;
      done = true;
      try {
        const row = {
          function_name: functionName,
          status,
          latency_ms: Date.now() - started,
          model,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          fallback_used: fallback,
          reason_code: reason,
          language: lang,
        };
        const write = Promise.resolve(
          adminClient()
            .from("model_events")
            .insert(row)
            .abortSignal(AbortSignal.timeout(WRITE_TIMEOUT_MS)),
        ).then(
          () => undefined,
          () => undefined,
        );
        const runtime = (globalThis as { EdgeRuntime?: RuntimeWithWaitUntil }).EdgeRuntime;
        if (typeof runtime?.waitUntil === "function") runtime.waitUntil(write);
      } catch {
        // monitoring never throws
      }
    },
  };
}

/** A reason code from a thrown error, using the messages the functions already produce. */
export function reasonFromError(e: unknown): string {
  if (e instanceof DOMException && (e.name === "AbortError" || e.name === "TimeoutError")) {
    return "timeout";
  }
  const message = e instanceof Error ? e.message : "";
  return /^[a-z0-9_]{1,40}$/.test(message) ? message : "error";
}
