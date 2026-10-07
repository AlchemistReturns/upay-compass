import type { Channel } from "@compass/shared";

export type TransactionRow = {
  id: string;
  amount: number;
  direction: "in" | "out";
  channel: Channel;
  counterparty: string;
  note: string;
  category_id: number | null;
  category_source: "rule" | "ai" | "user" | "model";
  needs_review: boolean;
  is_simulated: boolean;
  occurred_at: string;
};

export type DashboardSummary = { income: number; expense: number; tx_count: number };
export type CategorySpend = { category_id: number | null; total: number; tx_count: number };
export type WeekPoint = { week_start: string; income: number; expense: number };
