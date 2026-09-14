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
import { classifyTransactionPresentation } from "@/lib/category-classifier";

type CategoryRow = { name: string; amount: Prisma.Decimal | number | null; note: string | null };

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
      prisma.transaction.findMany({
        where: {
          userId: user.id,
          ...dateFilter,
          OR: [
            { type: "EXPENSE", kind: { in: ["STANDARD", "LOAN_INTEREST"] } },
            { type: "INCOME", kind: "REFUND" },
          ],
        },
        select: { type: true, kind: true, amount: true, category: { select: { name: true } }, note: true },
      }),
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

    const categoryMap = new Map<string, number>();
    for (const row of categoryRows) {
      const view = classifyTransactionPresentation(row.category?.name, row.note);
      const signed = row.kind === "REFUND" ? -Math.abs(Number(row.amount)) : Math.abs(Number(row.amount));
      categoryMap.set(view.name, (categoryMap.get(view.name) || 0) + signed);
    }
    const byCategory = Array.from(categoryMap.entries())
      .map(([name, amount]) => ({ name, amount }))
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
        presentationCategory: classifyTransactionPresentation(row.category?.name, row.note).name,
        presentationReason: classifyTransactionPresentation(row.category?.name, row.note).reason,
        paymentMethod: row.paymentMethod ? `${row.paymentMethod.nickname}${row.paymentMethod.last4 ? ` •••• ${row.paymentMethod.last4}` : ""}` : null,
        note: row.note,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    return NextResponse.json({ error: "חודש לא תקין" }, { status: 400 });
  }
}
