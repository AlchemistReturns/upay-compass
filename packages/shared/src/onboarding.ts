import { z } from "zod";

export const INCOME_TYPES = ["student", "gig", "salaried"] as const;
export type IncomeType = (typeof INCOME_TYPES)[number];

export const languageSchema = z.enum(["bn", "en"]);

export const incomeSchema = z.object({
  income_type: z.enum(INCOME_TYPES),
  monthly_income: z.number().min(0).max(100_000_000),
});

export const firstGoalSchema = z.object({
  title: z.string().trim().min(1).max(80),
  target_amount: z.number().positive().max(1_000_000_000),
  target_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

export type IncomeInput = z.infer<typeof incomeSchema>;
export type FirstGoalInput = z.infer<typeof firstGoalSchema>;
