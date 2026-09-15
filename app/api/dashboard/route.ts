import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { monthSchema } from "@/lib/validation";
import { getIsraelMonth, monthRange } from "@/lib/financial-engine";
import { calculateCategoryAmounts, calculateLedgerSummary } from "@/lib/ledger-engine";
import { classifyTransactionPresentation } from "@/lib/category-classifier";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const param = new URL(req.url).searchParams.get("month");
    const isAll = param === "all";
    const month = isAll ? "all" : monthSchema.parse(param || getIsraelMonth());
    const range = isAll ? null : monthRange(month);
    const dateFilter = range ? { transactionDate: { gte: range.start, lt: range.end } } : {};

    const [recentRows, transactions] = await Promise.all([
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
        select: {
          type: true,
          kind: true,
          amount: true,
          categoryId: true,
          category: { select: { name: true } },
        },
      }),
    ]);

    const ledgerRows = transactions.map((transaction) => ({
      type: transaction.type,
      kind: transaction.kind,
      amount: Number(transaction.amount),
      categoryId: transaction.categoryId,
      categoryName: transaction.category?.name,
    }));
    const summary = calculateLedgerSummary(ledgerRows);
    const byCategory = calculateCategoryAmounts(ledgerRows);

    return NextResponse.json({
      month,
      income: summary.income,
      expense: summary.operatingExpense,
      balance: summary.netCashFlow,
      netCashFlow: summary.netCashFlow,
      cashFlowBalance: summary.netCashFlow,
      financingActivity: summary.financingActivity,
      financingCashFlow: summary.financingCashFlow,
      debtPrincipal: summary.debtPrincipal,
      debtInterest: summary.debtInterest,
      loanReceived: summary.loanReceived,
      refunds: summary.refunds,
      byCategory: byCategory.map((row) => ({ name: row.categoryName, amount: row.amount, categoryId: row.categoryId })),
      recent: recentRows.map((row) => {
        const presentation = classifyTransactionPresentation(row.category?.name, row.note);
        return {
          id: row.id,
          type: row.type,
          kind: row.kind,
          amount: Number(row.amount),
          date: row.transactionDate.toISOString(),
          category: row.category?.name || "לא סווג",
          presentationCategory: presentation.name,
          presentationReason: presentation.reason,
          paymentMethod: row.paymentMethod
            ? `${row.paymentMethod.nickname}${row.paymentMethod.last4 ? ` •••• ${row.paymentMethod.last4}` : ""}`
            : null,
          note: row.note,
        };
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    return NextResponse.json({ error: "חודש לא תקין" }, { status: 400 });
  }
}
