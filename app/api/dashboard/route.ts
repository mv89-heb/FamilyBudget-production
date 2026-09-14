import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { monthSchema } from "@/lib/validation";
import {
  calculateCashFlowBalance,
  calculateFinancingActivity,
  calculateFinancingCashFlow,
  calculateNetExpense,
  calculateOperatingIncome,
  getIsraelMonth,
  monthRange,
  type FinancialTransaction,
} from "@/lib/financial-engine";

type CategoryRow = { name: string; amount: Prisma.Decimal | number | null };

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const param = new URL(req.url).searchParams.get("month");
    const isAll = param === "all";
    const month = isAll ? "all" : monthSchema.parse(param || getIsraelMonth());
    const range = isAll ? null : monthRange(month);
    const dateFilter = range ? { transactionDate: { gte: range.start, lt: range.end } } : {};

    const [rows, transactions, categoryRows] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId: user.id, ...dateFilter },
        select: {
          id: true,
          type: true,
          kind: true,
          amount: true,
          transactionDate: true,
          note: true,
          category: { select: { name: true } },
          paymentMethod: { select: { nickname: true, last4: true } },
        },
        orderBy: { transactionDate: "desc" },
        take: 8,
      }),
      prisma.transaction.findMany({
        where: { userId: user.id, ...dateFilter },
        select: { type: true, kind: true, amount: true },
      }),
      range
        ? prisma.$queryRaw<CategoryRow[]>(Prisma.sql`
            SELECT COALESCE(c."name", 'אחר') AS name,
                   COALESCE(SUM(CASE WHEN t.type = 'INCOME' AND t.kind = 'REFUND' THEN -t.amount ELSE t.amount END), 0) AS amount
            FROM "Transaction" t
            LEFT JOIN "Category" c ON c.id = t."categoryId"
            WHERE t."userId" = ${user.id}
              AND ((t.type = 'EXPENSE' AND t.kind IN ('STANDARD', 'LOAN_INTEREST'))
                OR (t.type = 'INCOME' AND t.kind = 'REFUND'))
              AND t."transactionDate" >= ${range.start}
              AND t."transactionDate" < ${range.end}
            GROUP BY COALESCE(c."name", 'אחר')
            HAVING COALESCE(SUM(CASE WHEN t.type = 'INCOME' AND t.kind = 'REFUND' THEN -t.amount ELSE t.amount END), 0) <> 0
            ORDER BY amount DESC
          `)
        : prisma.$queryRaw<CategoryRow[]>(Prisma.sql`
            SELECT COALESCE(c."name", 'אחר') AS name,
                   COALESCE(SUM(CASE WHEN t.type = 'INCOME' AND t.kind = 'REFUND' THEN -t.amount ELSE t.amount END), 0) AS amount
            FROM "Transaction" t
            LEFT JOIN "Category" c ON c.id = t."categoryId"
            WHERE t."userId" = ${user.id}
              AND ((t.type = 'EXPENSE' AND t.kind IN ('STANDARD', 'LOAN_INTEREST'))
                OR (t.type = 'INCOME' AND t.kind = 'REFUND'))
            GROUP BY COALESCE(c."name", 'אחר')
            HAVING COALESCE(SUM(CASE WHEN t.type = 'INCOME' AND t.kind = 'REFUND' THEN -t.amount ELSE t.amount END), 0) <> 0
            ORDER BY amount DESC
          `),
    ]);

    const normalized: FinancialTransaction[] = transactions.map((transaction) => ({
      type: transaction.type,
      kind: transaction.kind,
      amount: Number(transaction.amount),
    }));
    const income = calculateOperatingIncome(normalized);
    const expense = calculateNetExpense(normalized);
    const financingActivity = calculateFinancingActivity(normalized);
    const financingCashFlow = calculateFinancingCashFlow(normalized);
    const cashFlowBalance = calculateCashFlowBalance(normalized);
    const byCategory = categoryRows
      .map((row) => ({ name: row.name || "אחר", amount: Number(row.amount || 0) }))
      .filter((row) => row.amount !== 0)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

    return NextResponse.json({
      month,
      income,
      expense,
      balance: cashFlowBalance,
      cashFlowBalance,
      financingActivity,
      financingCashFlow,
      byCategory,
      recent: rows.map((row) => ({
        id: row.id,
        type: row.type,
        kind: row.kind,
        amount: Number(row.amount),
        date: row.transactionDate.toISOString(),
        category: row.category?.name || "אחר",
        paymentMethod: row.paymentMethod ? `${row.paymentMethod.nickname}${row.paymentMethod.last4 ? ` •••• ${row.paymentMethod.last4}` : ""}` : null,
        note: row.note,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    return NextResponse.json({ error: "חודש לא תקין" }, { status: 400 });
  }
}
