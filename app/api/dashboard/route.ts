import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { monthSchema } from "@/lib/validation";
import { getIsraelMonth, monthRange } from "@/lib/financial-engine";
import {
  calculateBudgetComparisons,
  calculateCategoryAmounts,
  calculateEmergencyFund,
  calculateLedgerSummary,
  calculateSavingsMetrics,
  calculateSmartInsights,
  roundMoney,
} from "@/lib/ledger-engine";
import { classifyTransactionPresentation } from "@/lib/category-classifier";

function monthBefore(month: string, count: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 - count, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const param = new URL(req.url).searchParams.get("month");
    const month = monthSchema.parse(param || getIsraelMonth());
    const range = monthRange(month);
    const historyStart = monthRange(monthBefore(month, 12)).start;

    const [recentRows, transactions, budgets, plan] = await Promise.all([
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
        where: { userId: user.id, transactionDate: { gte: historyStart, lt: range.end } },
        select: {
          type: true,
          kind: true,
          amount: true,
          transactionDate: true,
          categoryId: true,
          category: { select: { name: true } },
        },
      }),
      prisma.budget.findMany({
        where: { userId: user.id, month: range.start },
        select: { categoryId: true, limit: true, category: { select: { name: true } } },
        orderBy: { category: { name: "asc" } },
      }),
      prisma.financialPlan.findUnique({ where: { userId: user.id }, select: { emergencyFundAmount: true, emergencyTargetMonths: true } }),
    ]);

    const currentRows = transactions
      .filter((transaction) => transaction.transactionDate >= range.start && transaction.transactionDate < range.end)
      .map((transaction) => ({
        type: transaction.type,
        kind: transaction.kind,
        amount: Number(transaction.amount),
        categoryId: transaction.categoryId,
        categoryName: transaction.category?.name,
      }));

    const historicalRows = transactions
      .filter((transaction) => transaction.transactionDate < range.start)
      .map((transaction) => ({
        type: transaction.type,
        kind: transaction.kind,
        amount: Number(transaction.amount),
        categoryId: transaction.categoryId,
        categoryName: transaction.category?.name,
      }));

    const summary = calculateLedgerSummary(currentRows);
    const categories = calculateCategoryAmounts(currentRows);
    const savings = calculateSavingsMetrics(summary);
    const budgetComparisons = calculateBudgetComparisons(
      currentRows,
      budgets.map((budget) => ({ categoryId: budget.categoryId, categoryName: budget.category.name, limit: Number(budget.limit) })),
    );

    const historicalCategories = calculateCategoryAmounts(historicalRows);
    const dominant = categories[0] ?? null;
    const historicalDominant = dominant
      ? historicalCategories.find((row) => row.categoryId === dominant.categoryId || row.categoryName === dominant.categoryName)
      : null;
    const historicalAverage = historicalDominant ? historicalDominant.amount / 12 : 0;

    const hardBudgetTotal = budgets.reduce((sum, budget) => sum + Number(budget.limit), 0);
    const emergencyTarget = hardBudgetTotal > 0
      ? roundMoney(hardBudgetTotal * Math.max(3, Math.min(6, plan?.emergencyTargetMonths ?? 3)))
      : roundMoney(summary.operatingExpense * Math.max(3, Math.min(6, plan?.emergencyTargetMonths ?? 3)));
    const emergency = calculateEmergencyFund(Number(plan?.emergencyFundAmount ?? 0), emergencyTarget);
    const smart = calculateSmartInsights(summary, categories, {
      availableCash: summary.netCashFlow,
      emergencyRemaining: emergency.remaining,
      dominantCategoryHistoricalAverage: historicalAverage,
      currentDominantCategoryAmount: dominant?.amount,
    });

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
      byCategory: categories.map((row) => ({ name: row.categoryName, amount: Math.max(0, row.amount), categoryId: row.categoryId })),
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
