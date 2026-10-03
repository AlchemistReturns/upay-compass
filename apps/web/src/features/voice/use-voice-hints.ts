import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-provider";

/**
 * The places this person pays most often, to help the transcriber spell them ("Rahim Stall", not
 * "Rahim's still"). Only merchant names, only the most frequent few; read from their own payments.
 */
export function useVoiceHints() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["voice", userId, "hints"],
    enabled: Boolean(userId),
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("transactions")
        .select("counterparty")
        .eq("direction", "out")
        .order("occurred_at", { ascending: false })
        .limit(150);
      if (error) throw error;
      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        const name = String(row.counterparty ?? "").trim();
        if (name.length >= 2) counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      return [...counts]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([name]) => name);
    },
  });
}
