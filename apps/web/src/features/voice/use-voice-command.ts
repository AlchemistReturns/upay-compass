import type { Command, SpeechLang } from "@compass/shared";
import { supabase } from "@/lib/supabase";

export type CandidateTransaction = {
  id: string;
  amount: number;
  direction: "in" | "out";
  counterparty: string;
  occurred_at: string;
  category_id: number | null;
};

export type CommandResult =
  | { status: "ok"; command: Command; candidates?: CandidateTransaction[]; transcript: string }
  | { status: "rejected"; reason: string; transcript: string };

export type CommandFailure = "consent_required" | "rate_limited" | "unavailable" | "failed";

export class CommandError extends Error {
  constructor(readonly kind: CommandFailure) {
    super(kind);
  }
}

/** Sends what the person said (or typed) to the server, which returns one validated command or a reason it was refused. */
export async function parseCommand(text: string, lang: SpeechLang): Promise<CommandResult> {
  const { data, error } = await supabase.functions.invoke("voice-command", {
    body: { text, language: lang },
  });
  if (error) {
    const status = (error as { context?: Response }).context?.status;
    if (status === 403) throw new CommandError("consent_required");
    if (status === 429) throw new CommandError("rate_limited");
    if (status === 503) throw new CommandError("unavailable");
    throw new CommandError("failed");
  }
  return data as CommandResult;
}
