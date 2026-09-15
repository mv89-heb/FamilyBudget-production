import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { normalizeMonth } from "@/lib/validation";
import { getIsraelMonth, monthRange } from "@/lib/financial-engine";
import { getFinancialSourceOfTruth, recentTransactionPresentation } from "@/lib/financial-source";
import { classifyTransactionPresentation } from "@/lib/category-classifier";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const rawMonth = new URL(req.url).searchParams.get("month");
    const month = normalizeMonth(rawMonth || getIsraelMonth());
    const range = monthRange(month);
    const [financial, recentRows, monthRows] = await Promise.all([
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
      prisma.transaction.findMany({
        where: { userId: user.id, transactionDate: { gte: range.start, lt: range.end } },
        select: {
          id: true,
          type: true,
          kind: true,
          amount: true,
          transactionDate: true,
          categoryId: true,
          category: { select: { name: true } },
          note: true,
          paymentMethod: { select: { nickname: true, last4: true } },
        },
        orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
      }),
    ]);

    let actualDebtPayments = 0;
    let directSavings = 0;
    const categoryTotals = new Map<string, { categoryId: string | null; categoryName: string; amount: number }>();
    const incomeDetails: Array<Record<string, unknown>> = [];
    const expenseDetails: Array<Record<string, unknown>> = [];
    const debtDetails: Array<Record<string, unknown>> = [];
    const savingsDetails: Array<Record<string, unknown>> = [];

    for (const row of monthRows) {
      const amount = Math.abs(Number(row.amount));
      const presentation = classifyTransactionPresentation(row.category?.name, row.note);
      const isDebt = row.type === "EXPENSE" && (row.kind === "LOAN_PRINCIPAL" || row.kind === "LOAN_INTEREST" || presentation.isDebt);
      const isSavings = row.type === "EXPENSE" && presentation.isSavings && !presentation.isDebt && !presentation.isCreditCardPayment;
      const detail = {
        id: row.id,
        type: row.type,
        kind: row.kind,
        amount,
        date: row.transactionDate.toISOString(),
        category: row.category?.name?.trim() || "לא סווג",
        note: row.note,
        paymentMethod: row.paymentMethod ? `${row.paymentMethod.nickname}${row.paymentMethod.last4 ? ` •••• ${row.paymentMethod.last4}` : ""}` : null,
      };

      if (row.type === "INCOME") {
        incomeDetails.push(detail);
        continue;
      }
      if (isDebt) {
        actualDebtPayments += amount;
        debtDetails.push(detail);
        continue;
      }
      if (isSavings) {
        directSavings += amount;
        savingsDetails.push(detail);
        continue;
      }

      expenseDetails.push(detail);
      const categoryId = row.categoryId ?? null;
      const categoryName = row.category?.name?.trim() || "לא סווג";
      const key = categoryId ?? `name:${categoryName}`;
      const existing = categoryTotals.get(key);
      if (existing) existing.amount += amount;
      else categoryTotals.set(key, { categoryId, categoryName, amount });
    }

    actualDebtPayments = Math.round(actualDebtPayments * 100) / 100;
    directSavings = Math.round(directSavings * 100) / 100;
    const currentExpenses = Math.round([...categoryTotals.values()].reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
    const cashOutflow = Math.round((currentExpenses + directSavings + actualDebtPayments) * 100) / 100;
    const categoryTotal = currentExpenses;
    const byCategory = [...categoryTotals.values()]
      .map((row) => ({ ...row, amount: Math.round(row.amount * 100) / 100, sharePercent: categoryTotal > 0 ? Math.round((row.amount / categoryTotal) * 10000) / 100 : 0, startPercent: 0 }))
      .sort((a, b) => b.amount - a.amount)
      .map((row, index, rows) => ({ ...row, startPercent: rows.slice(0, index).reduce((sum, item) => sum + item.sharePercent, 0) }));

    const hasTransactions = financial.transactionCount > 0;
    const hasBudgets = financial.budgets.length > 0;
    const hasEmergencySource = financial.emergency.target > 0 || financial.emergency.current > 0;
    const drilldown = {
      income: incomeDetails,
      expenses: expenseDetails,
      debts: debtDetails,
      savings: savingsDetails,
      cashflow: [...incomeDetails, ...expenseDetails, ...debtDetails, ...savingsDetails],
    };

    return NextResponse.json({
      month,
      transactionCount: financial.transactionCount,
      dataQuality: {
        ledger: hasTransactions ? "HAS_DATA" : "NO_DATA",
        budget: hasBudgets ? "HAS_DATA" : "NO_DATA",
        emergency: hasEmergencySource ? "HAS_DATA" : "NO_DATA",
      },
      income: financial.ledger.income,
      expense: currentExpenses,
      balance: financial.ledger.netCashFlow,
      netCashFlow: financial.ledger.netCashFlow,
      cashOutflow,
      actualDebtPayments,
      directSavings,
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
      byCategory,
      debts: financial.debts,
      netWorth: financial.netWorth,
      recent: recentRows.map(recentTransactionPresentation),
      drilldown,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    if (error instanceof Error && error.message === "חודש לא תקין") return NextResponse.json({ error: "חודש לא תקין" }, { status: 400 });
    console.error("Dashboard load failed", error);
    return NextResponse.json({ error: "לא ניתן לטעון את הסקירה" }, { status: 500 });
  }
}
