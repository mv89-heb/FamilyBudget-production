import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { normalizeMonth } from "@/lib/validation";
import { getIsraelMonth, monthRange } from "@/lib/financial-engine";
import { getFinancialSourceOfTruth, recentTransactionPresentation } from "@/lib/financial-source";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const rawMonth = new URL(req.url).searchParams.get("month");
    const month = normalizeMonth(rawMonth || getIsraelMonth());
    const range = monthRange(month);
    const [financial, recentRows] = await Promise.all([
      getFinancialSourceOfTruth(user.id, month),
      prisma.transaction.findMany({
        where: { userId: user.id, transactionDate: { gte: range.start, lt: range.end } },
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
    ]);

    const hasTransactions = financial.transactionCount > 0;
    const hasBudgets = financial.budgets.length > 0;
    const hasEmergencySource = financial.emergency.target > 0 || financial.emergency.current > 0;

    return NextResponse.json({
      month,
      transactionCount: financial.transactionCount,
      dataQuality: {
        ledger: hasTransactions ? "HAS_DATA" : "NO_DATA",
        budget: hasBudgets ? "HAS_DATA" : "NO_DATA",
        emergency: hasEmergencySource ? "HAS_DATA" : "NO_DATA",
      },
      income: financial.ledger.income,
      expense: financial.ledger.operatingExpense,
      balance: financial.ledger.netCashFlow,
      netCashFlow: financial.ledger.netCashFlow,
      financingActivity: financial.ledger.financingActivity,
      financingCashFlow: financial.ledger.financingCashFlow,
      debtPrincipal: financial.ledger.debtPrincipal,
      debtInterest: financial.ledger.debtInterest,
      loanReceived: financial.ledger.loanReceived,
      refunds: financial.ledger.refunds,
      savings: financial.savings,
      emergency: financial.emergency,
      budgetComparisons: financial.budgets,
      insights: financial.insights,
      byCategory: financial.categories,
      debts: financial.debts,
      netWorth: financial.netWorth,
      recent: recentRows.map(recentTransactionPresentation),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    if (error instanceof Error && error.message === "חודש לא תקין") return NextResponse.json({ error: "חודש לא תקין" }, { status: 400 });
    console.error("Dashboard load failed", error);
    return NextResponse.json({ error: "לא ניתן לטעון את הסקירה" }, { status: 500 });
  }
}
