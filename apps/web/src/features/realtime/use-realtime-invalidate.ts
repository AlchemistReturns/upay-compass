import { useEffect, useId } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-provider";

/**
 * Refresh queries whenever the signed-in user's rows change in `table`.
 * `queryKeys` are prefixes, for example [["budgets"], ["dashboard"]].
 */
export function useRealtimeInvalidate(table: string, queryKeys: unknown[][]) {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const id = useId();
  const keysSignature = JSON.stringify(queryKeys);

  useEffect(() => {
    if (!userId) return;
    const keys = JSON.parse(keysSignature) as unknown[][];
    const channel = supabase
      .channel(`${table}:${userId}:${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `user_id=eq.${userId}` },
        () => {
          for (const key of keys) {
            void queryClient.invalidateQueries({ queryKey: [key[0], userId, ...key.slice(1)] });
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [table, userId, id, keysSignature, queryClient]);
}
