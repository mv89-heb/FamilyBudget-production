import {
  calculateFinancingActivity,
  calculateFinancingCashFlow,
  calculateNetExpense,
  calculateOperatingIncome,
  signedOperatingAmount,
  toNumber,
  type FinancialTransaction,
} from "@/lib/financial-engine";

export type LedgerTransaction = FinancialTransaction & {
  categoryId?: string | null;
  categoryName?: string | null;
};

export type LedgerSummary = {
  income: number;
  operatingExpense: number;
  refunds: number;
  debtPrincipal: number;
  debtInterest: number;
  loanReceived: number;
  financingActivity: number;
  netCashFlow: number;
};

export type CategoryAmount = {
  categoryId: string | null;
  categoryName: string;
  amount: number;
};

export type BudgetStatus = {
  limit: number;
  spent: number;
  remaining: number;
  percent: number;
  progressPercent: number;
  overBudget: boolean;
};

function positiveAmount(value: unknown) {
  return Math.abs(toNumber(value));
}

export function calculateLedgerSummary(transactions: readonly LedgerTransaction[]): LedgerSummary {
  let refunds = 0;
  let debtPrincipal = 0;
  let debtInterest = 0;
  let loanReceived = 0;

  for (const transaction of transactions) {
    const amount = positiveAmount(transaction.amount);
    if (transaction.kind === "REFUND") refunds += amount;
    if (transaction.kind === "LOAN_PRINCIPAL") debtPrincipal += amount;
    if (transaction.kind === "LOAN_INTEREST") debtInterest += amount;
    if (transaction.kind === "LOAN_RECEIVED") loanReceived += amount;
  }

  const income = calculateOperatingIncome(transactions);
  const operatingExpense = calculateNetExpense(transactions);
  const financingActivity = calculateFinancingActivity(transactions);
  const netCashFlow = calculateFinancingCashFlow(transactions) + income - operatingExpense;

  return {
    income: roundMoney(income),
    operatingExpense: roundMoney(operatingExpense),
    refunds: roundMoney(refunds),
    debtPrincipal: roundMoney(debtPrincipal),
    debtInterest: roundMoney(debtInterest),
    loanReceived: roundMoney(loanReceived),
    financingActivity: roundMoney(financingActivity),
    netCashFlow: roundMoney(netCashFlow),
  };
}

export function calculateCategoryAmounts(transactions: readonly LedgerTransaction[]): CategoryAmount[] {
  const totals = new Map<string, CategoryAmount>();

  for (const transaction of transactions) {
    const signed = signedOperatingAmount(transaction);
    if (signed === 0) continue;

    const categoryId = transaction.categoryId ?? null;
    const categoryName = transaction.categoryName?.trim() || "לא סווג";
    const key = categoryId ?? `name:${categoryName}`;
    const existing = totals.get(key);

    if (existing) existing.amount += signed;
    else totals.set(key, { categoryId, categoryName, amount: signed });
  }

  return [...totals.values()]
    .map((row) => ({ ...row, amount: roundMoney(row.amount) }))
    .filter((row) => row.amount !== 0)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

export function calculateBudgetStatus(limitInput: unknown, spentInput: unknown): BudgetStatus {
  const limit = roundMoney(Math.max(0, toNumber(limitInput)));
  const spent = roundMoney(Math.max(0, toNumber(spentInput)));
  const remaining = roundMoney(limit - spent);
  const percent = limit > 0 ? roundMoney((spent / limit) * 100) : 0;

  return {
    limit,
    spent,
    remaining,
    percent,
    progressPercent: Math.min(100, Math.max(0, percent)),
    overBudget: spent > limit,
  };
}

export function calculateBudgetSpending(transactions: readonly LedgerTransaction[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const row of calculateCategoryAmounts(transactions)) {
    if (row.categoryId) result.set(row.categoryId, row.amount);
  }
  return result;
}

export function roundMoney(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}
