import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-provider";

export type ImportSummary = {
  source: string;
  received: number;
  rejected: number;
  inserted: number;
  duplicates: number;
  ai_categorized: number;
  needs_review: number;
};

/** The error code the function put in its JSON body (for example "invalid_input"), or "unknown". */
export class ImportError extends Error {
  constructor(
    readonly code: string,
    readonly detail: string,
  ) {
    super(code);
  }
}

async function toImportError(error: unknown): Promise<ImportError> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: string; detail?: string };
      return new ImportError(body.error ?? "unknown", body.detail ?? "");
    } catch {
      // fall through
    }
  }
  return new ImportError("unknown", "");
}

async function runIngest(body: Record<string, unknown>): Promise<ImportSummary> {
  const { data, error } = await supabase.functions.invoke("ingest-transactions", { body });
  if (error) throw await toImportError(error);
  return data as ImportSummary;
}

/** Which import sources work right now (the live upay feed only appears once it is configured). */
export function useImportSources() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["import-sources", userId],
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ingest-transactions", {
        body: { action: "sources" },
      });
      if (error) throw error;
      return data as { simulated: boolean; statement_csv: boolean; upay_api: boolean };
    },
  });
}

function useRefreshAfterImport() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(
      ["dashboard", "transactions", "profile", "health", "forecast", "readiness", "nudges"].map(
        (key) => queryClient.invalidateQueries({ queryKey: [key, userId] }),
      ),
    );
  };
}

export function useImportStatement() {
  const refresh = useRefreshAfterImport();
  return useMutation({
    mutationFn: (input: { csv: string; openingBalance?: number }) =>
      runIngest({ source: "statement_csv", ...input }),
    onSuccess: refresh,
  });
}

export function useSyncUpay() {
  const refresh = useRefreshAfterImport();
  return useMutation({
    mutationFn: () => runIngest({ source: "upay_api" }),
    onSuccess: refresh,
  });
}
