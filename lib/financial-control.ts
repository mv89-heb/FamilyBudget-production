import { toNumber } from "@/lib/financial-engine";

export type ForecastInput = {
  month: string;
  recurringIncome: number;
  recurringExpenses: number;
  sinkingContributions: number;
  oneOffExpenses?: number;
};

export type ForecastRow = ForecastInput & { netCashFlow: number; status: "POSITIVE" | "TIGHT" | "DEFICIT" };

export function calculateNetWorth(assets: readonly number[], liabilities: readonly number[]) {
  const totalAssets = roundMoney(assets.reduce((sum, value) => sum + Math.max(0, toNumber(value)), 0));
  const totalLiabilities = roundMoney(liabilities.reduce((sum, value) => sum + Math.max(0, toNumber(value)), 0));
  return { assets: totalAssets, liabilities: totalLiabilities, netWorth: roundMoney(totalAssets - totalLiabilities) };
}

export function calculateReconciliationDifference(ledgerBalance: number, bankBalance: number) {
  return roundMoney(toNumber(bankBalance) - toNumber(ledgerBalance));
}

export function forecastMonths(inputs: readonly ForecastInput[]): ForecastRow[] {
  return inputs.map((row) => {
    const netCashFlow = roundMoney(row.recurringIncome - row.recurringExpenses - row.sinkingContributions - (row.oneOffExpenses ?? 0));
    return { ...row, netCashFlow, status: netCashFlow < 0 ? "DEFICIT" : netCashFlow < Math.max(500, row.recurringIncome * 0.05) ? "TIGHT" : "POSITIVE" };
  });
}

export function calculateMonthlySinkingContribution(targetAmount: number, currentAmount: number, dueDate: Date, fromDate = new Date()) {
  const remaining = Math.max(0, toNumber(targetAmount) - toNumber(currentAmount));
  const months = Math.max(1, (dueDate.getUTCFullYear() - fromDate.getUTCFullYear()) * 12 + dueDate.getUTCMonth() - fromDate.getUTCMonth());
  return roundMoney(remaining / months);
}

export function calculateAmortizationSchedule(input: { principal: number; annualRate: number; monthlyPayment: number; startDate: Date; maxMonths?: number }) {
  let balance = Math.max(0, toNumber(input.principal));
  const monthlyRate = Math.max(0, toNumber(input.annualRate)) / 100 / 12;
  const payment = Math.max(0, toNumber(input.monthlyPayment));
  const maxMonths = Math.min(600, Math.max(1, input.maxMonths ?? 600));
  const entries: Array<{ paymentDate: Date; payment: number; principal: number; interest: number; balanceAfter: number }> = [];
  if (balance <= 0 || payment <= 0) return entries;
  for (let index = 0; index < maxMonths && balance > 0.01; index += 1) {
    const interest = roundMoney(balance * monthlyRate);
    const principal = roundMoney(Math.min(balance, Math.max(0, payment - interest)));
    const actualPayment = roundMoney(principal + interest);
    balance = roundMoney(Math.max(0, balance - principal));
    const date = new Date(Date.UTC(input.startDate.getUTCFullYear(), input.startDate.getUTCMonth() + index, input.startDate.getUTCDate()));
    entries.push({ paymentDate: date, payment: actualPayment, principal, interest, balanceAfter: balance });
    if (principal <= 0) break;
  }
  return entries;
}

export function roundMoney(value: number) { return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100; }
