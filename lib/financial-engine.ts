export type FinancialTransaction = {
  type: string;
  kind: string;
  amount: number;
  transactionDate?: Date;
  categoryId?: string | null;
  categoryName?: string | null;
};

export const EXPENSE_KINDS = ["STANDARD", "LOAN_INTEREST"] as const;
export const INCOME_KINDS = ["STANDARD"] as const;
export const FINANCING_KINDS = ["LOAN_RECEIVED", "LOAN_PRINCIPAL", "TRANSFER", "CASH_WITHDRAWAL"] as const;

export function isTransfer(transaction: FinancialTransaction): boolean {
  return transaction.kind === "TRANSFER";
}
export function isCashWithdrawal(transaction: FinancialTransaction): boolean {
  return transaction.kind === "CASH_WITHDRAWAL";
}
export function isLoanPrincipal(transaction: FinancialTransaction): boolean {
  return transaction.kind === "LOAN_PRINCIPAL";
}
export function isLoanInterest(transaction: FinancialTransaction): boolean {
  return transaction.kind === "LOAN_INTEREST";
}
export function isLoanReceived(transaction: FinancialTransaction): boolean {
  return transaction.kind === "LOAN_RECEIVED";
}
export function isRefund(transaction: FinancialTransaction): boolean {
  return transaction.kind === "REFUND";
}
export function isOperatingExpense(transaction: FinancialTransaction): boolean {
  return transaction.type === "EXPENSE" && (EXPENSE_KINDS as readonly string[]).includes(transaction.kind);
}
export function isOperatingIncome(transaction: FinancialTransaction): boolean {
  return transaction.type === "INCOME" && (INCOME_KINDS as readonly string[]).includes(transaction.kind);
}
export function isFinancingActivity(transaction: FinancialTransaction): boolean {
  return (FINANCING_KINDS as readonly string[]).includes(transaction.kind);
}

/**
 * Refunds are stored as their own transaction kind and reduce operating expense.
 * A refund is never treated as ordinary household income.
 */
export function signedOperatingAmount(transaction: FinancialTransaction): number {
  if (isRefund(transaction)) return -Math.abs(transaction.amount);
  if (isOperatingExpense(transaction)) return Math.abs(transaction.amount);
  return 0;
}

export function calculateNetExpense(transactions: readonly FinancialTransaction[]): number {
  let total = 0;
  for (const transaction of transactions) total += signedOperatingAmount(transaction);
  return total;
}

export function calculateOperatingIncome(transactions: readonly FinancialTransaction[]): number {
  let total = 0;
  for (const transaction of transactions) {
    if (isOperatingIncome(transaction)) total += Math.abs(transaction.amount);
  }
  return total;
}

export function calculateDebtPayments(transactions: readonly FinancialTransaction[]): number {
  let total = 0;
  for (const transaction of transactions) {
    if (isLoanPrincipal(transaction) || isLoanInterest(transaction)) total += Math.abs(transaction.amount);
  }
  return total;
}

export function calculateFinancingActivity(transactions: readonly FinancialTransaction[]): number {
  let total = 0;
  for (const transaction of transactions) {
    if (isFinancingActivity(transaction)) total += Math.abs(transaction.amount);
  }
  return total;
}

export function getIsraelMonth(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit" }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new Error("Unable to determine Israel month");
  return `${year}-${month}`;
}

export function monthStart(month: string): Date {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Invalid month");
  return new Date(`${month}-01T00:00:00.000Z`);
}

export function nextMonthStart(month: string): Date {
  const start = monthStart(month);
  const next = new Date(start);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

export function monthRange(month: string): { start: Date; end: Date } {
  return { start: monthStart(month), end: nextMonthStart(month) };
}

export function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    const parsed = Number(value.toNumber());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function sum(values: readonly unknown[]): number {
  let total = 0;
  for (const value of values) total += toNumber(value);
  return total;
}
