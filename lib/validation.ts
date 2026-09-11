import { z } from "zod";

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "חודש לא תקין");
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך לא תקין").refine((value) => {
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}, "תאריך לא תקין");

export const transactionKindSchema = z.enum([
  "STANDARD",
  "TRANSFER",
  "CASH_WITHDRAWAL",
  "LOAN_RECEIVED",
  "LOAN_PRINCIPAL",
  "LOAN_INTEREST",
  "REFUND",
]);

export const transactionSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]),
  kind: transactionKindSchema.default("STANDARD"),
  amount: z.coerce.number().finite().positive().max(999999999),
  transactionDate: dateSchema,
  categoryId: z.string().min(1).max(100),
  paymentMethodId: z.string().min(1).max(100).optional().nullable(),
  loanId: z.string().min(1).max(100).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
}).superRefine((value, ctx) => {
  const nonExpenseKinds = ["TRANSFER", "CASH_WITHDRAWAL", "LOAN_RECEIVED", "LOAN_PRINCIPAL"] as const;
  if (nonExpenseKinds.includes(value.kind as (typeof nonExpenseKinds)[number]) && value.type === "EXPENSE" && value.kind === "LOAN_RECEIVED") {
    ctx.addIssue({ code: "custom", path: ["kind"], message: "קבלת הלוואה אינה הוצאה" });
  }
  if (["LOAN_RECEIVED", "LOAN_PRINCIPAL", "LOAN_INTEREST"].includes(value.kind) && !value.loanId) {
    ctx.addIssue({ code: "custom", path: ["loanId"], message: "יש לבחור הלוואה" });
  }
});

export const paymentMethodSchema = z.object({
  type: z.enum(["CASH", "CARD", "BANK_ACCOUNT", "OTHER"]),
  nickname: z.string().trim().min(1).max(80),
  institution: z.string().trim().max(100).optional().nullable(),
  last4: z.string().regex(/^\d{4}$/).optional().nullable(),
}).superRefine((value, ctx) => {
  if ((value.type === "CARD" || value.type === "BANK_ACCOUNT") && !value.last4) {
    ctx.addIssue({ code: "custom", path: ["last4"], message: "נדרשות 4 ספרות אחרונות" });
  }
  if (value.type === "CASH" && value.last4) {
    ctx.addIssue({ code: "custom", path: ["last4"], message: "לא ניתן להזין ספרות עבור מזומן" });
  }
});

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  type: z.enum(["INCOME", "EXPENSE"]),
});

export const budgetSchema = z.object({
  categoryId: z.string().min(1).max(100),
  month: monthSchema,
  limit: z.coerce.number().finite().nonnegative().max(999999999),
});

export { monthSchema };
