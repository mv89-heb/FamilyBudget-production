import { prisma } from "@/lib/prisma";
import { getIsraelMonth, monthRange } from "@/lib/financial-engine";
import { calculateBudgetComparisons, calculateCategoryBreakdown, calculateCategoryAmounts, calculateEmergencyFund, calculateLedgerSummary, calculateSavingsMetrics, calculateSmartInsights, roundMoney, type LedgerTransaction } from "@/lib/ledger-engine";
import { calculateNetWorth } from "@/lib/financial-control";
import { classifyTransactionPresentation } from "@/lib/category-classifier";

export type FinancialSourceOfTruth = {
  month: string;
  transactionCount: number;
  ledger: ReturnType<typeof calculateLedgerSummary>;
  savings: ReturnType<typeof calculateSavingsMetrics>;
  emergency: ReturnType<typeof calculateEmergencyFund>;
  budgets: ReturnType<typeof calculateBudgetComparisons>;
  categories: ReturnType<typeof calculateCategoryBreakdown>;
  insights: ReturnType<typeof calculateSmartInsights>["insights"];
  debts: { count: number; outstanding: number; monthlyPayments: number; principalPaid: number; interestPaid: number };
  netWorth: ReturnType<typeof calculateNetWorth>;
  assets: { id: string; name: string; type: string; currentValue: number }[];
  liabilities: { id: string; name: string; type: string; currentBalance: number; loanId: string | null }[];
  loans: { id: string; name: string; originalAmount: number; outstandingAmount: number | null; interestRate: number | null; monthlyPayment: number | null; startDate: string | null; endDate: string | null; principalPaid: number; interestPaid: number; source: "MANUAL" | "INFERRED" }[];
};

function toLedgerTransaction(row: { type: "INCOME" | "EXPENSE"; kind: LedgerTransaction["kind"]; amount: unknown; transactionDate: Date; categoryId?: string | null; category?: { name: string } | null; note?: string | null }): LedgerTransaction {
  return { type: row.type, kind: row.kind, amount: Number(row.amount), transactionDate: row.transactionDate, categoryId: row.categoryId ?? null, categoryName: row.category?.name, note: row.note ?? null };
}
function normalizeLoanName(value: string) { return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("he"); }

export async function getFinancialSourceOfTruth(userId: string, requestedMonth?: string): Promise<FinancialSourceOfTruth> {
  const month = requestedMonth || getIsraelMonth();
  const range = monthRange(month);
  const historyStart = monthRange(monthBefore(month, 12)).start;
  const [transactions, budgets, plan, loans, assets, liabilities, emergencyFunds] = await Promise.all([
    prisma.transaction.findMany({ where: { userId, transactionDate: { gte: historyStart, lt: range.end } }, select: { type: true, kind: true, amount: true, transactionDate: true, categoryId: true, loanId: true, note: true, category: { select: { name: true } } } }),
    prisma.budget.findMany({ where: { userId, month: range.start }, select: { categoryId: true, limit: true, class: true, category: { select: { name: true } } }, orderBy: { category: { name: "asc" } } }),
    prisma.financialPlan.findUnique({ where: { userId }, select: { emergencyFundAmount: true, emergencyTargetMonths: true } }),
    prisma.loan.findMany({ where: { userId }, select: { id: true, name: true, originalAmount: true, outstandingAmount: true, interestRate: true, monthlyPayment: true, startDate: true, endDate: true, transactions: { select: { kind: true, amount: true, transactionDate: true } } } }),
    prisma.asset.findMany({ where: { userId, active: true }, select: { id: true, name: true, type: true, currentValue: true } }),
    prisma.liability.findMany({ where: { userId, active: true }, select: { id: true, name: true, type: true, currentBalance: true, monthlyPayment: true, loanId: true } }),
    prisma.sinkingFund.findMany({ where: { userId, active: true, name: { contains: "חירום" } }, select: { currentAmount: true } }),
  ]);
  const allRows = transactions.map(toLedgerTransaction).filter((row): row is LedgerTransaction & { transactionDate: Date } => row.transactionDate instanceof Date);
  const currentRows = allRows.filter((row) => row.transactionDate >= range.start && row.transactionDate < range.end);
  const summary = calculateLedgerSummary(currentRows);
  const categories = calculateCategoryBreakdown(currentRows);
  const savings = calculateSavingsMetrics(summary, currentRows);
  const budgetsForEngine = budgets.map((budget) => ({ categoryId: budget.categoryId, categoryName: budget.category.name, limit: Number(budget.limit) }));
  const budgetComparisons = calculateBudgetComparisons(currentRows, budgetsForEngine);
  const emergencyMonths = Math.max(3, Math.min(6, plan?.emergencyTargetMonths ?? 3));
  const hardBudgetTotal = budgets.filter((budget) => budget.class === "HARD").reduce((sum, budget) => sum + Number(budget.limit), 0);
  const emergencyTarget = hardBudgetTotal > 0 ? roundMoney(hardBudgetTotal * emergencyMonths) : roundMoney(summary.operatingExpense * emergencyMonths);
  const emergencyCurrent = emergencyFunds.reduce((sum, fund) => sum + Number(fund.currentAmount), 0) || Number(plan?.emergencyFundAmount ?? 0);
  const emergency = calculateEmergencyFund(emergencyCurrent, emergencyTarget);
  const historicalRows = allRows.filter((row) => row.transactionDate < range.start);
  const historicalCategories = calculateCategoryAmounts(historicalRows);
  const dominant = categories[0] ?? null;
  const historicalDominant = dominant ? historicalCategories.find((row) => row.categoryId === dominant.categoryId || row.categoryName === dominant.categoryName) : null;
  const smart = calculateSmartInsights(summary, categories, { availableCash: summary.netCashFlow, emergencyRemaining: emergency.remaining, dominantCategoryHistoricalAverage: historicalDominant ? historicalDominant.amount / 12 : 0, currentDominantCategoryAmount: dominant?.amount }, currentRows);
  const principalPaid = roundMoney(summary.debtPrincipal);
  const interestPaid = roundMoney(summary.debtInterest);
  const manualLoans = loans.map((loan) => ({ id: loan.id, name: loan.name, originalAmount: Number(loan.originalAmount), outstandingAmount: loan.outstandingAmount == null ? null : Number(loan.outstandingAmount), interestRate: loan.interestRate == null ? null : Number(loan.interestRate), monthlyPayment: loan.monthlyPayment == null ? null : Number(loan.monthlyPayment), startDate: loan.startDate?.toISOString().slice(0, 10) ?? null, endDate: loan.endDate?.toISOString().slice(0, 10) ?? null, principalPaid: roundMoney(loan.transactions.filter((row) => row.kind === "LOAN_PRINCIPAL").reduce((sum, row) => sum + Number(row.amount), 0)), interestPaid: roundMoney(loan.transactions.filter((row) => row.kind === "LOAN_INTEREST").reduce((sum, row) => sum + Number(row.amount), 0)), source: "MANUAL" as const }));
  const manualLoanNames = new Set(manualLoans.map((loan) => normalizeLoanName(loan.name)));
  const inferredGroups = new Map<string, { name: string; rows: { amount: number; transactionDate: Date }[] }>();
  for (const row of transactions) {
    const debtCategory = row.category?.name?.trim() === "חובות והלוואות";
    const loanPayment = row.kind === "LOAN_PRINCIPAL";
    if ((!loanPayment && !debtCategory) || row.loanId || !row.note || row.type !== "EXPENSE") continue;
    const name = row.note.replace(/\s+/g, " ").trim();
    if (!name) continue;
    const key = normalizeLoanName(name);
    if (manualLoanNames.has(key)) continue;
    const group = inferredGroups.get(key) ?? { name, rows: [] };
    group.rows.push({ amount: Number(row.amount), transactionDate: row.transactionDate });
    inferredGroups.set(key, group);
  }
  const inferredLoans = Array.from(inferredGroups.entries()).map(([key, group]) => {
    const sorted = [...group.rows].sort((a, b) => b.transactionDate.getTime() - a.transactionDate.getTime());
    const totalPaid = roundMoney(group.rows.reduce((sum, row) => sum + Math.abs(row.amount), 0));
    const earliest = group.rows.reduce((value, row) => row.transactionDate < value ? row.transactionDate : value, group.rows[0].transactionDate);
    return { id: `inferred:${key}`, name: group.name, originalAmount: totalPaid, outstandingAmount: null, interestRate: null, monthlyPayment: roundMoney(Math.abs(sorted[0]?.amount ?? 0)), startDate: earliest.toISOString().slice(0, 10), endDate: null, principalPaid: totalPaid, interestPaid: 0, source: "INFERRED" as const };
  });
  const allLoans = [...manualLoans, ...inferredLoans];
  const loanOutstanding = manualLoans.reduce((sum, loan) => sum + (loan.outstandingAmount == null ? 0 : loan.outstandingAmount), 0);
  const loanPayments = allLoans.reduce((sum, loan) => sum + (loan.monthlyPayment == null ? 0 : loan.monthlyPayment), 0);
  const linkedLoanIds = new Set(loans.map((loan) => loan.id));
  const loanById = new Map(loans.map((loan) => [loan.id, loan]));
  const standaloneLiabilities = liabilities.filter((row) => !row.loanId || !linkedLoanIds.has(row.loanId));
  const standaloneLiabilityBalance = standaloneLiabilities.reduce((sum, row) => sum + Number(row.currentBalance), 0);
  const standaloneLiabilityPayments = standaloneLiabilities.reduce((sum, row) => sum + (row.monthlyPayment == null ? 0 : Number(row.monthlyPayment)), 0);
  const liabilityTotal = loanOutstanding + standaloneLiabilityBalance;
  const netWorth = calculateNetWorth(assets.map((row) => Number(row.currentValue)), [liabilityTotal]);
  return { month, transactionCount: currentRows.length, ledger: summary, savings, emergency, budgets: budgetComparisons, categories, insights: smart.insights, debts: { count: allLoans.length + standaloneLiabilities.length, outstanding: roundMoney(liabilityTotal), monthlyPayments: roundMoney(loanPayments + standaloneLiabilityPayments), principalPaid, interestPaid }, netWorth, assets: assets.map((row) => ({ id: row.id, name: row.name, type: row.type, currentValue: Number(row.currentValue) })), liabilities: liabilities.map((row) => { const linkedLoan = row.loanId ? loanById.get(row.loanId) : null; return { id: row.id, name: row.name, type: row.type, currentBalance: linkedLoan?.outstandingAmount == null ? Number(row.currentBalance) : Number(linkedLoan.outstandingAmount), loanId: row.loanId }; }), loans: allLoans };
}
export function monthBefore(month: string, count: number) { const [year, monthNumber] = month.split("-").map(Number); const date = new Date(Date.UTC(year, monthNumber - 1 - count, 1)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`; }
export function recentTransactionPresentation(row: { id: string; type: "INCOME" | "EXPENSE"; kind: LedgerTransaction["kind"]; amount: unknown; transactionDate: Date; category?: { name: string } | null; note?: string | null; paymentMethod?: { nickname: string; last4: string | null } | null }) { const presentation = classifyTransactionPresentation(row.category?.name, row.note ?? null); return { id: row.id, type: row.type, kind: row.kind, amount: Number(row.amount), date: row.transactionDate.toISOString(), category: row.category?.name || "לא סווג", presentationCategory: presentation.name, presentationReason: presentation.reason, paymentMethod: row.paymentMethod ? `${row.paymentMethod.nickname}${row.paymentMethod.last4 ? ` •••• ${row.paymentMethod.last4}` : ""}` : null, note: row.note ?? null }; }
