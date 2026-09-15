import { prisma } from "@/lib/prisma";
import { getIsraelMonth, monthRange } from "@/lib/financial-engine";
import {
  calculateBudgetComparisons,
  calculateCategoryBreakdown,
  calculateCategoryAmounts,
  calculateEmergencyFund,
  calculateLedgerSummary,
  calculateSavingsMetrics,
  calculateSmartInsights,
  roundMoney,
  type LedgerTransaction,
} from "@/lib/ledger-engine";
import { calculateNetWorth } from "@/lib/financial-control";
import { classifyTransactionPresentation } from "@/lib/category-classifier";

export type FinancialSourceOfTruth = {
  month: string;
  ledger: ReturnType<typeof calculateLedgerSummary>;
  savings: ReturnType<typeof calculateSavingsMetrics>;
  emergency: ReturnType<typeof calculateEmergencyFund>;
  budgets: ReturnType<typeof calculateBudgetComparisons>;
  categories: ReturnType<typeof calculateCategoryBreakdown>;
  insights: ReturnType<typeof calculateSmartInsights>["insights"];
  debts: {
    count: number;
    outstanding: number;
    monthlyPayments: number;
    principalPaid: number;
    interestPaid: number;
  };
  netWorth: ReturnType<typeof calculateNetWorth>;
  assets: { id: string; name: string; type: string; currentValue: number }[];
  liabilities: { id: string; name: string; type: string; currentBalance: number; loanId: string | null }[];
};

function toLedgerTransaction(row: {
  type: "INCOME" | "EXPENSE";
  kind: LedgerTransaction["kind"];
  amount: unknown;
  transactionDate: Date;
  categoryId?: string | null;
  category?: { name: string } | null;
  note?: string | null;
}): LedgerTransaction {
  return {
    type: row.type,
    kind: row.kind,
    amount: Number(row.amount),
    transactionDate: row.transactionDate,
    categoryId: row.categoryId ?? null,
    categoryName: row.category?.name,
    note: row.note ?? null,
  };
}

export async function getFinancialSourceOfTruth(userId: string, requestedMonth?: string): Promise<FinancialSourceOfTruth> {
  const month = requestedMonth || getIsraelMonth();
  const range = monthRange(month);
  const historyStart = monthRange(monthBefore(month, 12)).start;

  const [transactions, budgets, plan, loans, assets, liabilities, emergencyFunds] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, transactionDate: { gte: historyStart, lt: range.end } },
      select: { type: true, kind: true, amount: true, transactionDate: true, categoryId: true, note: true, category: { select: { name: true } } },
    }),
    prisma.budget.findMany({ where: { userId, month: range.start }, select: { categoryId: true, limit: true, category: { select: { name: true } } }, orderBy: { category: { name: "asc" } } }),
    prisma.financialPlan.findUnique({ where: { userId }, select: { emergencyFundAmount: true, emergencyTargetMonths: true } }),
    prisma.loan.findMany({ where: { userId }, select: { id: true, outstandingAmount: true, monthlyPayment: true, transactions: { select: { kind: true, amount: true } } } }),
    prisma.asset.findMany({ where: { userId, active: true }, select: { id: true, name: true, type: true, currentValue: true } }),
    prisma.liability.findMany({ where: { userId, active: true }, select: { id: true, name: true, type: true, currentBalance: true, loanId: true } }),
    prisma.sinkingFund.findMany({ where: { userId, active: true, name: { contains: "חירום" } }, select: { currentAmount: true } }),
  ]);

  const allRows = transactions.map(toLedgerTransaction);
  const currentRows = allRows.filter((row) => row.transactionDate >= range.start && row.transactionDate < range.end);
  const summary = calculateLedgerSummary(currentRows);
  const categories = calculateCategoryBreakdown(currentRows);
  const savings = calculateSavingsMetrics(summary, currentRows);
  const budgetsForEngine = budgets.map((budget) => ({ categoryId: budget.categoryId, categoryName: budget.category.name, limit: Number(budget.limit) }));
  const budgetComparisons = calculateBudgetComparisons(currentRows, budgetsForEngine);

  const emergencyMonths = Math.max(3, Math.min(6, plan?.emergencyTargetMonths ?? 3));
  const hardBudgetTotal = budgets.filter((budget) => budget.categoryId && true).reduce((sum, budget) => sum + Number(budget.limit), 0);
  const emergencyTarget = hardBudgetTotal > 0 ? roundMoney(hardBudgetTotal * emergencyMonths) : roundMoney(summary.operatingExpense * emergencyMonths);
  const emergencyCurrent = emergencyFunds.reduce((sum, fund) => sum + Number(fund.currentAmount), 0) || Number(plan?.emergencyFundAmount ?? 0);
  const emergency = calculateEmergencyFund(emergencyCurrent, emergencyTarget);

  const historicalRows = allRows.filter((row) => row.transactionDate < range.start);
  const historicalCategories = calculateCategoryAmounts(historicalRows);
  const dominant = categories[0] ?? null;
  const historicalDominant = dominant ? historicalCategories.find((row) => row.categoryId === dominant.categoryId || row.categoryName === dominant.categoryName) : null;
  const smart = calculateSmartInsights(summary, categories, {
    availableCash: summary.netCashFlow,
    emergencyRemaining: emergency.remaining,
    dominantCategoryHistoricalAverage: historicalDominant ? historicalDominant.amount / 12 : 0,
    currentDominantCategoryAmount: dominant?.amount,
  }, currentRows);

  const principalPaid = loans.reduce((sum, loan) => sum + loan.transactions.filter((row) => row.kind === "LOAN_PRINCIPAL").reduce((inner, row) => inner + Number(row.amount), 0), 0);
  const interestPaid = loans.reduce((sum, loan) => sum + loan.transactions.filter((row) => row.kind === "LOAN_INTEREST").reduce((inner, row) => inner + Number(row.amount), 0), 0);
  const loanOutstanding = loans.reduce((sum, loan) => sum + (loan.outstandingAmount == null ? 0 : Number(loan.outstandingAmount)), 0);
  const loanPayments = loans.reduce((sum, loan) => sum + (loan.monthlyPayment == null ? 0 : Number(loan.monthlyPayment)), 0);

  const linkedLoanIds = new Set(loans.map((loan) => loan.id));
  const standaloneLiabilities = liabilities.filter((row) => !row.loanId || !linkedLoanIds.has(row.loanId));
  const liabilityTotal = loanOutstanding + standaloneLiabilities.reduce((sum, row) => sum + Number(row.currentBalance), 0);
  const netWorth = calculateNetWorth(
    assets.map((row) => Number(row.currentValue)),
    [liabilityTotal],
  );

  return {
    month,
    ledger: summary,
    savings,
    emergency,
    budgets: budgetComparisons,
    categories,
    insights: smart.insights,
    debts: {
      count: loans.length + standaloneLiabilities.length,
      outstanding: roundMoney(liabilityTotal),
      monthlyPayments: roundMoney(loanPayments + standaloneLiabilities.reduce((sum, row) => sum + 0, 0)),
      principalPaid: roundMoney(principalPaid),
      interestPaid: roundMoney(interestPaid),
    },
    netWorth,
    assets: assets.map((row) => ({ id: row.id, name: row.name, type: row.type, currentValue: Number(row.currentValue) })),
    liabilities: liabilities.map((row) => ({ id: row.id, name: row.name, type: row.type, currentBalance: Number(row.currentBalance), loanId: row.loanId })),
  };
}

export function monthBefore(month: string, count: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 - count, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function recentTransactionPresentation(row: { id: string; type: "INCOME" | "EXPENSE"; kind: LedgerTransaction["kind"]; amount: unknown; transactionDate: Date; category?: { name: string } | null; note?: string | null; paymentMethod?: { nickname: string; last4: string | null } | null }) {
  const presentation = classifyTransactionPresentation(row.category?.name, row.note ?? null);
  return {
    id: row.id,
    type: row.type,
    kind: row.kind,
    amount: Number(row.amount),
    date: row.transactionDate.toISOString(),
    category: row.category?.name || "לא סווג",
    presentationCategory: presentation.name,
    presentationReason: presentation.reason,
    paymentMethod: row.paymentMethod ? `${row.paymentMethod.nickname}${row.paymentMethod.last4 ? ` •••• ${row.paymentMethod.last4}` : ""}` : null,
    note: row.note ?? null,
  };
}
