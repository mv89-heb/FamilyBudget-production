import { z } from "zod";

export const transactionSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]),
  amount: z.coerce.number().positive().max(999999999),
  transactionDate: z.string().min(1),
  categoryId: z.string().min(1),
  paymentMethodId: z.string().optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export const paymentMethodSchema = z.object({
  type: z.enum(["CASH", "CARD", "BANK_ACCOUNT", "OTHER"]),
  nickname: z.string().trim().min(1).max(80),
  institution: z.string().trim().max(100).optional().nullable(),
  last4: z.string().regex(/^\\d{4}$/).optional().nullable(),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  type: z.enum(["INCOME", "EXPENSE"]),
});

export const budgetSchema = z.object({
  categoryId: z.string().min(1),
  month: z.string().min(7),
  limit: z.coerce.number().nonnegative().max(999999999),
});
