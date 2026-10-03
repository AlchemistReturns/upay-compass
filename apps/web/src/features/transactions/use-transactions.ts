import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  categorize,
  isCategoryKey,
  type Channel,
  type CategoryKey,
  type UserRule,
} from "@compass/shared";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-provider";
import { useCategories } from "@/features/categories/use-categories";
import { useRefreshHealth } from "@/features/health/use-health";
import type { TransactionRow } from "./types";

const COLUMNS =
  "id,amount,direction,channel,counterparty,note,category_id,category_source,needs_review,is_simulated,occurred_at";

export function useTransactionList(limit: number) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["transactions", userId, "list", limit],
    enabled: Boolean(userId),
    queryFn: async (): Promise<TransactionRow[]> => {
      const { data, error } = await supabase
        .from("transactions")
        .select(COLUMNS)
        .order("occurred_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) })) as TransactionRow[];
    },
  });
}

export function useTransaction(id: string) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["transactions", userId, "one", id],
    enabled: Boolean(userId),
    queryFn: async (): Promise<TransactionRow | null> => {
      const { data, error } = await supabase
        .from("transactions")
        .select(COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? ({ ...data, amount: Number(data.amount) } as TransactionRow) : null;
    },
  });
}

/** Refresh the dashboard and lists whenever this user's transactions change (any tab, any source). */
export function useTransactionsRealtime() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`transactions:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions", filter: `user_id=eq.${userId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["dashboard", userId] });
          void queryClient.invalidateQueries({ queryKey: ["transactions", userId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}

function useInvalidateMoney() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const refreshHealth = useRefreshHealth();
  return () => {
    // The health score depends on income and spending, so recompute it after any change
    // (best effort, in the background; the previous snapshot stays valid if this fails).
    void refreshHealth();
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["dashboard", userId] }),
      queryClient.invalidateQueries({ queryKey: ["transactions", userId] }),
    ]);
  };
}

export type TransactionInput = {
  amount: number;
  direction: "in" | "out";
  channel: Channel;
  counterparty: string;
  note: string;
  occurred_at: string;
};

/** Manual add: rules run here; anything they cannot place is filed under Other and sent to the AI function. */
export function useAddTransaction() {
  const { userId } = useAuth();
  const { data: categories } = useCategories();
  const invalidate = useInvalidateMoney();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: TransactionInput) => {
      if (!userId || !categories) throw new Error("Not ready");
      const idByKey = new Map(categories.map((c) => [c.key, c.id]));
      const keyById = new Map(categories.map((c) => [c.id, c.key]));

      const { data: ruleRows, error: ruleErr } = await supabase
        .from("category_rules")
        .select("keyword,category_id");
      if (ruleErr) throw ruleErr;
      const rules: UserRule[] = (ruleRows ?? []).flatMap((r) => {
        const key = keyById.get(r.category_id as number);
        return key && isCategoryKey(key)
          ? [{ keyword: r.keyword as string, category: key as CategoryKey }]
          : [];
      });

      const result = categorize(input, rules);
      const { data, error } = await supabase
        .from("transactions")
        .insert({
          user_id: userId,
          ...input,
          category_id: idByKey.get(result?.category ?? "other"),
          category_source: result?.source ?? "rule",
          needs_review: result === null,
          is_simulated: false,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (result === null) {
        // Best effort: if the AI function is unavailable the transaction stays under Other, flagged for review.
        void supabase.functions
          .invoke("categorize-transaction", { body: { transaction_ids: [data.id] } })
          .then(invalidate);
      }
      return data.id as string;
    },
    onSuccess: async () => {
      await invalidate();
      // Best effort: check the new payment for being unusual, so the alert shows up straight away.
      void supabase.functions
        .invoke("generate-nudges", { body: {} })
        .finally(() => queryClient.invalidateQueries({ queryKey: ["nudges", userId] }));
    },
  });
}

export function useUpdateTransaction(id: string) {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: async (
      input: TransactionInput & { category_id: number | null; categoryChanged: boolean },
    ) => {
      const { category_id, categoryChanged, ...fields } = input;
      const { error } = await supabase.from("transactions").update(fields).eq("id", id);
      if (error) throw error;
      if (categoryChanged && category_id !== null) {
        // Saves a rule for this merchant and re-applies it to the user's other matching transactions.
        const { error: rpcErr } = await supabase.rpc("set_transaction_category", {
          p_transaction_id: id,
          p_category_id: category_id,
        });
        if (rpcErr) throw rpcErr;
      }
    },
    onSuccess: invalidate,
  });
}

/** Deletes a payment and hands back the row as it was, so the delete can be undone. */
async function deleteReturning(id: string): Promise<TransactionRow | null> {
  const { data, error: readErr } = await supabase
    .from("transactions")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw readErr;
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw error;
  return data ? ({ ...data, amount: Number(data.amount) } as TransactionRow) : null;
}

export function useDeleteTransaction(id: string) {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: () => deleteReturning(id),
    onSuccess: invalidate,
  });
}

/** Delete a payment by id (the id is chosen at call time, unlike `useDeleteTransaction`). */
export function useDeleteTransactionById() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (id: string) => deleteReturning(id),
    onSuccess: invalidate,
  });
}

/** Puts a deleted payment back exactly as it was (same id, time and category). */
export function useRestoreTransaction() {
  const { userId } = useAuth();
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: async (row: TransactionRow) => {
      if (!userId) throw new Error("Not signed in");
      const { error } = await supabase.from("transactions").insert({ ...row, user_id: userId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useIngestDemoData() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (persona: "student" | "gig" | "salaried") => {
      const { data, error } = await supabase.functions.invoke("ingest-transactions", {
        body: { persona },
      });
      if (error) throw error;
      return data as { inserted: number; duplicates: number; needs_review: number };
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard", userId] }),
        queryClient.invalidateQueries({ queryKey: ["transactions", userId] }),
        queryClient.invalidateQueries({ queryKey: ["profile", userId] }),
      ]);
    },
  });
}
