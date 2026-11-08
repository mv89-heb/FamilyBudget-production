import { classifyTransactionPresentation } from "@/lib/category-classifier";

export type MortgagePeriodTransaction = {
  type: "INCOME" | "EXPENSE";
  kind: string;
  amount: number;
  transactionDate: Date;
  category?: { name: string } | null;
  note?: string | null;
};

export type MortgageMonthlyFlow = {
  month: string;
  income: number;
  operatingExpenses: number;
  debtPayments: number;
  savings: number;
};

const money = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

export function calculateMortgageMonthlyFlows(
  rows: readonly MortgagePeriodTransaction[],
  monthKeys: readonly string[],
) {
  const totals = new Map<string, MortgageMonthlyFlow>(
    monthKeys.map((month) => [month, { month, income: 0, operatingExpenses: 0, debtPayments: 0, savings: 0 }]),
  );

  for (const row of rows) {
    const month = `${row.transactionDate.getUTCFullYear()}-${String(row.transactionDate.getUTCMonth() + 1).padStart(2, "0")}`;
    const bucket = totals.get(month);
    if (!bucket) continue;
    const amount = Math.abs(Number(row.amount) || 0);
    const presentation = classifyTransactionPresentation(row.category?.name, row.note ?? null);

    if (row.type === "INCOME") {
      if (row.kind !== "LOAN_RECEIVED" && row.kind !== "REFUND") bucket.income += amount;
      continue;
    }
    if (presentation.isCreditCardPayment || row.kind === "TRANSFER" || row.kind === "CASH_WITHDRAWAL") continue;
    if (row.kind === "LOAN_PRINCIPAL" || row.kind === "LOAN_INTEREST" || presentation.isDebt) {
      bucket.debtPayments += amount;
      continue;
    }
    if (presentation.isSavings) {
      bucket.savings += amount;
      continue;
    }
    if (row.kind === "STANDARD" || row.kind === "LOAN_INTEREST") bucket.operatingExpenses += amount;
  }

  const months = monthKeys.map((month) => {
    const row = totals.get(month)!;
    return {
      month: row.month,
      income: money(row.income),
      operatingExpenses: money(row.operatingExpenses),
      debtPayments: money(row.debtPayments),
      savings: money(row.savings),
    };
  });
  const average = (key: "income" | "operatingExpenses" | "debtPayments" | "savings") =>
    months.length ? money(months.reduce((sum, row) => sum + row[key], 0) / months.length) : 0;

  return {
    months,
    averages: {
      income: average("income"),
      operatingExpenses: average("operatingExpenses"),
      debtPayments: average("debtPayments"),
      savings: average("savings"),
      remainingBeforeDebt: money(average("income") - average("operatingExpenses")),
      remainingAfterDebt: money(average("income") - average("operatingExpenses") - average("debtPayments") - average("savings")),
    },
  };
}

export function calculateDebtToIncomeRatio(monthlyDebtPayments: number, monthlyIncome: number) {
  if (!(monthlyIncome > 0)) return null;
  return money((Math.max(0, monthlyDebtPayments) / monthlyIncome) * 100);
}
