import { z } from "zod";

export const CHANNELS = [
  "send_money",
  "cash_out",
  "merchant",
  "recharge",
  "bill",
  "add_money",
] as const;

export const transactionSchema = z.object({
  id: z.string(),
  amount: z.number().positive(),
  direction: z.enum(["in", "out"]),
  channel: z.enum(CHANNELS),
  counterparty: z.string(),
  note: z.string().default(""),
  occurred_at: z.string().datetime(),
});

export type Transaction = z.infer<typeof transactionSchema>;
export type Channel = (typeof CHANNELS)[number];
