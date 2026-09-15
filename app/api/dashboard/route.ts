import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { monthSchema } from "@/lib/validation";
import { getIsraelMonth, monthRange } from "@/lib/financial-engine";
import {
  calculateBudgetComparisons,
  calculateCategoryAmounts,
  calculateCategoryBreakdown,
  calculateEmergencyFund,
  calculateLedgerSummary,
  calculateSavingsMetrics,
  calculateSmartInsights,
  roundMoney,
} from "@/lib/ledger-engine";
import { calculateNetWorth, forecastMonths } from "@/lib/financial-control";
import { classifyTransactionPresentation } from "@/lib/category-classifier";

function monthBefore(month: string, count: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 - count, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function addMonths(date: Date, count: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const param = new URL(req.url).searchParams.get("month");
    const month = monthSchema.parse(param || getIsraelMonth());
    const range = monthRange(month);
    const historyStart = monthRange(monthBefore(month, 12)).start;

    const [recentRows, transactions, budgets, plan, loans, liabilities, assets, incomeSources, sinkingFunds, latestReconciliation] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId: user.id, transactionDate: { gte: range.start, lt: range.end } },
        select: { id: true, type: true, kind: true, amount: true, transactionDate: true, note: true, category: { select: { name: true } }, paymentMethod: { select: { nickname: true, last4: true } } },
        orderBy: { transactionDate: "desc" }, take: 8,
      }),
      prisma.transaction.findMany({
        where: { userId: user.id, transactionDate: { gte: historyStart, lt: range.end } },
        select: { type: true, kind: true, amount: true, transactionDate: true, categoryId: true, note: true, category: { select: { name: true } } },
      }),
      prisma.budget.findMany({ where: { userId: user.id, month: range.start }, select: { categoryId: true, limit: true, category: { select: { name: true } } }, orderBy: { category: { name: "asc" } } }),
      prisma.financialPlan.findUnique({ where: { userId: user.id }, select: { emergencyFundAmount: true, emergencyTargetMonths: true } }),
      prisma.loan.findMany({ where: { userId: user.id }, select: { id: true, name: true, originalAmount: true, outstandingAmount: true, interestRate: true, monthlyPayment: true, transactions: { where: { transactionDate: { gte: range.start, lt: range.end } }, select: { kind: true, amount: true } } }, orderBy: { name: "asc" } }),
      prisma.liability.findMany({ where: { userId: user.id, active: true }, select: { id: true, name: true, type: true, currentBalance: true, monthlyPayment: true, loanId: true }, orderBy: { name: "asc" } }),
      prisma.asset.findMany({ where: { userId: user.id, active: true }, select: { id: true, name: true, type: true, currentValue: true }, orderBy: { name: "asc" } }),
      prisma.incomeSource.findMany({ where: { userId: user.id, active: true }, select: { monthlyAmount: true } }),
      prisma.sinkingFund.findMany({ where: { userId: user.id, active: true }, select: { id: true, name: true, targetAmount: true, currentAmount: true, monthlyContribution: true, dueDate: true } }),
      prisma.bankReconciliation.findFirst({ where: { userId: user.id }, orderBy: { month: "desc" } }),
    ]);

    const currentRows = transactions.filter((transaction) => transaction.transactionDate >= range.start && transaction.transactionDate < range.end).map((transaction) => ({ type: transaction.type, kind: transaction.kind, amount: Number(transaction.amount), categoryId: transaction.categoryId, categoryName: transaction.category?.name, note: transaction.note, transactionDate: transaction.transactionDate }));
    const historicalRows = transactions.filter((transaction) => transaction.transactionDate < range.start).map((transaction) => ({ type: transaction.type, kind: transaction.kind, amount: Number(transaction.amount), categoryId: transaction.categoryId, categoryName: transaction.category?.name, note: transaction.note, transactionDate: transaction.transactionDate }));

    const summary = calculateLedgerSummary(currentRows);
    const categories = calculateCategoryAmounts(currentRows);
    const categoryBreakdown = calculateCategoryBreakdown(currentRows);
    const savings = calculateSavingsMetrics(summary, currentRows);
    const budgetComparisons = calculateBudgetComparisons(currentRows, budgets.map((budget) => ({ categoryId: budget.categoryId, categoryName: budget.category.name, limit: Number(budget.limit) })));

    const historicalCategories = calculateCategoryAmounts(historicalRows);
    const dominant = categories[0] ?? null;
    const historicalDominant = dominant ? historicalCategories.find((row) => row.categoryId === dominant.categoryId || row.categoryName === dominant.categoryName) : null;
    const historicalAverage = historicalDominant ? historicalDominant.amount / 12 : 0;

    const emergencyMonths = Math.max(3, Math.min(6, plan?.emergencyTargetMonths ?? 3));
    const hardBudgetTotal = budgets.reduce((sum, budget) => sum + Number(budget.limit), 0);
    const emergencyTarget = hardBudgetTotal > 0 ? roundMoney(hardBudgetTotal * emergencyMonths) : roundMoney(summary.operatingExpense * emergencyMonths);
    const emergency = calculateEmergencyFund(Number(plan?.emergencyFundAmount ?? 0), emergencyTarget);
    const smart = calculateSmartInsights(summary, categories, {
      availableCash: summary.netCashFlow,
      emergencyRemaining: emergency.remaining,
      dominantCategoryHistoricalAverage: historicalAverage,
      currentDominantCategoryAmount: dominant?.amount,
    }, currentRows);

    // Loans are canonical debt records. A Liability with loanId is only a linked
    // representation and must not be counted a second time in net worth.
    const loanRows = loans.map((loan) => ({
      id: loan.id,
      name: loan.name,
      outstandingAmount: loan.outstandingAmount == null ? null : Number(loan.outstandingAmount),
      monthlyPayment: loan.monthlyPayment == null ? null : Number(loan.monthlyPayment),
      interestRate: loan.interestRate == null ? null : Number(loan.interestRate),
      principalPaidThisMonth: roundMoney(loan.transactions.filter((tx) => tx.kind === "LOAN_PRINCIPAL").reduce((sum, tx) => sum + Number(tx.amount), 0)),
      interestPaidThisMonth: roundMoney(loan.transactions.filter((tx) => tx.kind === "LOAN_INTEREST").reduce((sum, tx) => sum + Number(tx.amount), 0)),
    }));
    const linkedLoanIds = new Set(liabilities.map((liability) => liability.loanId).filter((id): id is string => Boolean(id)));
    const unlinkedLiabilities = liabilities.filter((liability) => !liability.loanId || !linkedLoanIds.has(liability.loanId));
    const loanLiabilities = loanRows.filter((loan) => loan.outstandingAmount != null).map((loan) => loan.outstandingAmount ?? 0);
    const totalLiabilities = [...loanLiabilities, ...unlinkedLiabilities.map((row) => Number(row.currentBalance))];
    const netWorth = calculateNetWorth(assets.map((row) => Number(row.currentValue)), totalLiabilities);
    const totalMonthlyDebtPayment = roundMoney([
      ...loanRows.map((loan) => loan.monthlyPayment ?? 0),
      ...unlinkedLiabilities.map((row) => Number(row.monthlyPayment ?? 0)),
    ].reduce((sum, value) => sum + value, 0));

    const historicalExpenseByMonth = new Map<string, number>();
    for (const transaction of historicalRows) {
      if (transaction.type !== "EXPENSE" || (transaction.kind !== "STANDARD" && transaction.kind !== "LOAN_INTEREST")) continue;
      const presentation = classifyTransactionPresentation(transaction.categoryName, transaction.note);
      if (presentation.isSavings || presentation.isDebt || presentation.isCreditCardPayment) continue;
      const key = monthKey(transaction.transactionDate);
      historicalExpenseByMonth.set(key, (historicalExpenseByMonth.get(key) ?? 0) + Number(transaction.amount));
    }
    const historicalExpenseValues = [...historicalExpenseByMonth.values()];
    const averageExpenses = historicalExpenseValues.length ? historicalExpenseValues.reduce((a, b) => a + b, 0) / historicalExpenseValues.length : 0;
    const recurringIncome = incomeSources.reduce((sum, row) => sum + Number(row.monthlyAmount), 0);
    const sinkingContributions = sinkingFunds.reduce((sum, row) => sum + Number(row.monthlyContribution), 0);
    const forecastBase = recurringIncome > 0 ? recurringIncome : summary.income;
    const forecastRows = forecastMonths(Array.from({ length: 6 }, (_, index) => {
      const date = addMonths(range.start, index + 1);
      return { month: monthKey(date), recurringIncome: forecastBase, recurringExpenses: roundMoney(averageExpenses), sinkingContributions: roundMoney(sinkingContributions + totalMonthlyDebtPayment) };
    }));

    return NextResponse.json({
      month,
      income: summary.income,
      expense: summary.operatingExpense,
      balance: summary.netCashFlow,
      netCashFlow: summary.netCashFlow,
      financingActivity: summary.financingActivity,
      financingCashFlow: summary.financingCashFlow,
      debtPrincipal: summary.debtPrincipal,
      debtInterest: summary.debtInterest,
      loanReceived: summary.loanReceived,
      refunds: summary.refunds,
      savings,
      emergency,
      budgetComparisons,
      insights: smart.insights,
      dominantCategory: smart.dominantCategory,
      byCategory: categoryBreakdown,
      recent: recentRows.map((row) => {
        const presentation = classifyTransactionPresentation(row.category?.name, row.note);
        return { id: row.id, type: row.type, kind: row.kind, amount: Number(row.amount), date: row.transactionDate.toISOString(), category: row.category?.name || "לא סווג", presentationCategory: presentation.name, presentationReason: presentation.reason, paymentMethod: row.paymentMethod ? `${row.paymentMethod.nickname}${row.paymentMethod.last4 ? ` •••• ${row.paymentMethod.last4}` : ""}` : null, note: row.note };
      }),
      netWorth: {
        ...netWorth,
        assetCount: assets.length,
        liabilityCount: loanRows.length + unlinkedLiabilities.length,
      },
      debts: {
        totalOutstanding: roundMoney(totalLiabilities.reduce((sum, value) => sum + value, 0)),
        monthlyPayment: totalMonthlyDebtPayment,
        principalPaidThisMonth: roundMoney(loanRows.reduce((sum, loan) => sum + loan.principalPaidThisMonth, 0) + summary.debtPrincipal - loanRows.reduce((sum, loan) => sum + loan.principalPaidThisMonth, 0)),
        interestPaidThisMonth: roundMoney(loanRows.reduce((sum, loan) => sum + loan.interestPaidThisMonth, 0) + summary.debtInterest - loanRows.reduce((sum, loan) => sum + loan.interestPaidThisMonth, 0)),
        loans: loanRows,
        otherLiabilities: unlinkedLiabilities.map((row) => ({ id: row.id, name: row.name, type: row.type, balance: Number(row.currentBalance), monthlyPayment: Number(row.monthlyPayment ?? 0) })),
      },
      forecast: { rows: forecastRows, sinkingFunds: sinkingFunds.map((row) => ({ id: row.id, name: row.name, targetAmount: Number(row.targetAmount), currentAmount: Number(row.currentAmount), monthlyContribution: Number(row.monthlyContribution), dueDate: row.dueDate?.toISOString() ?? null })) },
      reconciliation: latestReconciliation ? { month: latestReconciliation.month.toISOString(), ledgerBalance: Number(latestReconciliation.ledgerBalance), bankBalance: Number(latestReconciliation.bankBalance), difference: Number(latestReconciliation.difference), status: latestReconciliation.status } : null,
    });
  } catch (error) {
    console.error("Dashboard error", error);
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    return NextResponse.json({ error: "לא ניתן לטעון את תמונת המצב הפיננסית" }, { status: 500 });
  }
}
