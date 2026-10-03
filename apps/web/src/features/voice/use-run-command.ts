"use client";

import { useCallback } from "react";
import { dhakaDay, type Command } from "@compass/shared";
import { supabase } from "@/lib/supabase";
import { useCategories } from "@/features/categories/use-categories";
import { useBudgetProgress, useSaveBudget } from "@/features/budgets/use-budgets";
import { useContribute, useCreateGoal, useUndoContribution } from "@/features/goals/use-goals";
import {
  useAddTransaction,
  useDeleteTransactionById,
} from "@/features/transactions/use-transactions";

export type RunOutcome = {
  /** What happened, as data for the message ("added", "budget", ...). */
  kind: "added" | "budget" | "goal" | "goal_added" | "deleted";
  amount?: number;
  /** Puts it back as it was, when that is possible. */
  undo?: () => Promise<void>;
};

const DEFAULT_ALERT = 0.8;

/**
 * Runs a CONFIRMED command through the same code the forms use, so row level security, round-ups,
 * budget alerts, the unusual-payment check and the health score all behave exactly as for typing.
 * Nothing here talks to the voice functions or to a model.
 */
export function useRunCommand() {
  const { data: categories } = useCategories();
  const progress = useBudgetProgress();
  const addTransaction = useAddTransaction();
  const deleteById = useDeleteTransactionById();
  const saveBudget = useSaveBudget();
  const createGoal = useCreateGoal();
  const contribute = useContribute();
  const undoContribution = useUndoContribution();

  return useCallback(
    async (command: Command, extra: { deleteId?: string } = {}): Promise<RunOutcome> => {
      const categoryId = (key: string) => categories?.find((c) => c.key === key)?.id ?? null;

      switch (command.intent) {
        case "add_transaction": {
          const today = dhakaDay(new Date());
          const id = await addTransaction.mutateAsync({
            amount: command.amount,
            direction: command.direction,
            channel: command.direction === "in" ? "add_money" : "merchant",
            counterparty: command.merchant,
            note: command.note,
            // today keeps the real time; another day is noon that day (Bangladesh time)
            occurred_at:
              command.date === today
                ? new Date().toISOString()
                : new Date(`${command.date}T12:00:00+06:00`).toISOString(),
          });
          // The app files it by its own rules; if the person chose a different category on the
          // card, apply theirs the way an edit does (this also teaches the rule for the merchant).
          const wanted = categoryId(command.category);
          if (wanted !== null) {
            const { data } = await supabase
              .from("transactions")
              .select("category_id")
              .eq("id", id)
              .single();
            if (data && data.category_id !== wanted) {
              await supabase.rpc("set_transaction_category", {
                p_transaction_id: id,
                p_category_id: wanted,
              });
            }
          }
          return {
            kind: "added",
            amount: command.amount,
            undo: async () => {
              await deleteById.mutateAsync(id);
            },
          };
        }

        case "create_budget": {
          const id = categoryId(command.category);
          if (id === null) throw new Error("unknown category");
          const existing = progress.data?.find((b) => b.category_id === id);
          await saveBudget.mutateAsync({
            category_id: id,
            limit_amount: command.limit,
            alert_threshold: existing?.alert_threshold ?? DEFAULT_ALERT,
          });
          return { kind: "budget", amount: command.limit };
        }

        case "create_goal":
          await createGoal.mutateAsync({
            title: command.title,
            target_amount: command.target,
            target_date: command.targetDate,
          });
          return { kind: "goal", amount: command.target };

        case "add_to_goal": {
          if (!command.goalId) throw new Error("no goal chosen");
          const contributionId = await contribute.mutateAsync({
            goalId: command.goalId,
            amount: command.amount,
          });
          return {
            kind: "goal_added",
            amount: command.amount,
            undo: async () => {
              await undoContribution.mutateAsync(contributionId);
            },
          };
        }

        case "delete_transaction":
          if (!extra.deleteId) throw new Error("no payment chosen");
          await deleteById.mutateAsync(extra.deleteId);
          return { kind: "deleted" };

        case "ask_coach":
          throw new Error("questions go to the coach, not here");
      }
    },
    [
      categories,
      progress.data,
      addTransaction,
      deleteById,
      saveBudget,
      createGoal,
      contribute,
      undoContribution,
    ],
  );
}
