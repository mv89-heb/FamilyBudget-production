export type FinancialTransaction = {
  type: string;
  kind: string;
  amount: number;
  transactionDate?: Date;
  categoryId?: string | null;
  categoryName?: string | null;
  note?: string | null;
};

export type CreditCardFinancialTransaction = {
  type: string;
  kind: string;
  amount: number;
  purchaseDate?: Date;
  postingDate?: Date | null;
};

export const EXPENSE_KINDS = ["STANDARD", "LOAN_INTEREST"] as const;
export const INCOME_KINDS = ["STANDARD"] as const;
export const FINANCING_KINDS = ["LOAN_RECEIVED", "LOAN_PRINCIPAL"] as const;
export const INTERNAL_MOVEMENT_KINDS = ["TRANSFER", "CASH_WITHDRAWAL"] as const;

export function isTransfer(transaction: FinancialTransaction): boolean { return transaction.kind === "TRANSFER"; }
export function isCashWithdrawal(transaction: FinancialTransaction): boolean { return transaction.kind === "CASH_WITHDRAWAL"; }
export function isLoanPrincipal(transaction: FinancialTransaction): boolean { return transaction.kind === "LOAN_PRINCIPAL"; }
export function isLoanInterest(transaction: FinancialTransaction): boolean { return transaction.kind === "LOAN_INTEREST"; }
export function isLoanReceived(transaction: FinancialTransaction): boolean { return transaction.kind === "LOAN_RECEIVED"; }
export function isRefund(transaction: FinancialTransaction): boolean { return transaction.kind === "REFUND"; }
export function isOperatingExpense(transaction: FinancialTransaction): boolean { return transaction.type === "EXPENSE" && (EXPENSE_KINDS as readonly string[]).includes(transaction.kind); }
export function isOperatingIncome(transaction: FinancialTransaction): boolean { return transaction.type === "INCOME" && (INCOME_KINDS as readonly string[]).includes(transaction.kind); }
export function isFinancingActivity(transaction: FinancialTransaction): boolean { return (FINANCING_KINDS as readonly string[]).includes(transaction.kind); }
export function isInternalMovement(transaction: FinancialTransaction): boolean { return (INTERNAL_MOVEMENT_KINDS as readonly string[]).includes(transaction.kind); }

/** Refunds are stored as their own transaction kind and reduce operating expense. */
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
  for (const transaction of transactions) if (isOperatingIncome(transaction)) total += Math.abs(transaction.amount);
  return total;
}

/** Calculates debt service without changing the persisted accounting kind of legacy rows. */
export function calculateDebtPayments(
  transactions: readonly FinancialTransaction[],
  isAdditionalDebt?: (transaction: FinancialTransaction) => boolean,
): number {
  let total = 0;
  for (const transaction of transactions) {
    if (isLoanPrincipal(transaction) || isLoanInterest(transaction) || isAdditionalDebt?.(transaction)) total += Math.abs(transaction.amount);
  }
  return total;
}

/** Gross financing activity. Transfers and cash withdrawals are internal movements, not financing. */
export function calculateFinancingActivity(transactions: readonly FinancialTransaction[]): number {
  let total = 0;
  for (const transaction of transactions) if (isFinancingActivity(transaction)) total += Math.abs(transaction.amount);
  return total;
}

/** Net cash effect of financing. Internal transfers and cash withdrawals have zero net household effect. */
export function calculateFinancingCashFlow(transactions: readonly FinancialTransaction[]): number {
  let total = 0;
  for (const transaction of transactions) {
    if (isLoanReceived(transaction)) total += Math.abs(transaction.amount);
    else if (isLoanPrincipal(transaction)) total -= Math.abs(transaction.amount);
  }
  return total;
}

/** Net household cash movement for the selected period, not an account balance. */
export function calculateCashFlowBalance(transactions: readonly FinancialTransaction[]): number {
  return calculateOperatingIncome(transactions) - calculateNetExpense(transactions) + calculateFinancingCashFlow(transactions);
}

/** Card purchases, installments and fees are consumption detail only. */
export function signedCreditCardAmount(transaction: CreditCardFinancialTransaction): number {
  if (transaction.type === "REFUND" || transaction.kind === "REFUND") return -Math.abs(transaction.amount);
  if (transaction.type === "CHARGE") return Math.abs(transaction.amount);
  return 0;
}

export function calculateCreditCardNetExpense(transactions: readonly CreditCardFinancialTransaction[]): number {
  let total = 0;
  for (const transaction of transactions) total += signedCreditCardAmount(transaction);
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
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Invalid month");
  return new Date(`${month}-01T00:00:00.000Z`);
}

export function nextMonthStart(month: string): Date {
  const start = monthStart(month);
  const next = new Date(start);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

export function monthRange(month: string): { start: Date; end: Date } { return { start: monthStart(month), end: nextMonthStart(month) }; }

export function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
  if (value && typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") { const parsed = Number(value.toNumber()); return Number.isFinite(parsed) ? parsed : 0; }
  return 0;
}

export function sum(values: readonly unknown[]): number { let total = 0; for (const value of values) total += toNumber(value); return total; }
