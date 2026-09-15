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
  financingCashFlow: number;
  netCashFlow: number;
};

export type CategoryAmount = {
  categoryId: string | null;
  categoryName: string;
  amount: number;
};

export type CategoryBreakdown = CategoryAmount & {
  sharePercent: number;
  startPercent: number;
};

export type BudgetStatus = {
  limit: number;
  spent: number;
  remaining: number;
  percent: number;
  progressPercent: number;
  overBudget: boolean;
  status: "GOOD" | "WARNING" | "OVER";
};

export type BudgetComparison = BudgetStatus & {
  categoryId: string;
  categoryName: string;
};

export type SavingsMetrics = {
  directSavings: number;
  directSavingsRate: number;
  debtPrincipalPaid: number;
  wealthBuilding: number;
  wealthBuildingRate: number;
};

export type EmergencyFundMetrics = {
  current: number;
  target: number;
  progressPercent: number;
  remaining: number;
};

export type FinancialInsight = {
  type: "POSITIVE" | "WARNING" | "ACTION";
  title: string;
  text: string;
};

export type SmartInsights = {
  savings: SavingsMetrics;
  dominantCategory: CategoryAmount | null;
  insights: FinancialInsight[];
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
  const financingCashFlow = calculateFinancingCashFlow(transactions);
  const netCashFlow = financingCashFlow + income - operatingExpense;

  return {
    income: roundMoney(income),
    operatingExpense: roundMoney(operatingExpense),
    refunds: roundMoney(refunds),
    debtPrincipal: roundMoney(debtPrincipal),
    debtInterest: roundMoney(debtInterest),
    loanReceived: roundMoney(loanReceived),
    financingActivity: roundMoney(financingActivity),
    financingCashFlow: roundMoney(financingCashFlow),
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

export function calculateCategoryBreakdown(transactions: readonly LedgerTransaction[]): CategoryBreakdown[] {
  const categories = calculateCategoryAmounts(transactions).map((row) => ({ ...row, amount: Math.max(0, row.amount) }));
  const total = categories.reduce((sum, row) => sum + row.amount, 0);
  let cursor = 0;
  return categories.map((row) => {
    const sharePercent = total > 0 ? roundMoney((row.amount / total) * 100) : 0;
    const result = { ...row, sharePercent, startPercent: roundMoney(cursor) };
    cursor += sharePercent;
    return result;
  });
}

export function calculateBudgetStatus(limitInput: unknown, spentInput: unknown): BudgetStatus {
  const limit = roundMoney(Math.max(0, toNumber(limitInput)));
  const spent = roundMoney(Math.max(0, toNumber(spentInput)));
  const remaining = roundMoney(limit - spent);
  const percent = limit > 0 ? roundMoney((spent / limit) * 100) : 0;
  const status = spent > limit ? "OVER" : percent >= 80 ? "WARNING" : "GOOD";

  return {
    limit,
    spent,
    remaining,
    percent,
    progressPercent: Math.min(100, Math.max(0, percent)),
    overBudget: spent > limit,
    status,
  };
}

export function calculateBudgetComparisons(
  transactions: readonly LedgerTransaction[],
  budgets: readonly { categoryId: string; categoryName: string; limit: number }[],
): BudgetComparison[] {
  const spending = calculateBudgetSpending(transactions);
  return budgets.map((budget) => ({
    categoryId: budget.categoryId,
    categoryName: budget.categoryName,
    ...calculateBudgetStatus(budget.limit, spending.get(budget.categoryId) ?? 0),
  }));
}

export function calculateBudgetSpending(transactions: readonly LedgerTransaction[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const row of calculateCategoryAmounts(transactions)) {
    if (row.categoryId) result.set(row.categoryId, Math.max(0, row.amount));
  }
  return result;
}

export function calculateSavingsMetrics(summary: LedgerSummary): SavingsMetrics {
  const directSavings = Math.max(0, summary.income - summary.operatingExpense);
  const wealthBuilding = directSavings + summary.debtPrincipal;
  return {
    directSavings: roundMoney(directSavings),
    directSavingsRate: summary.income > 0 ? roundMoney((directSavings / summary.income) * 100) : 0,
    debtPrincipalPaid: roundMoney(summary.debtPrincipal),
    wealthBuilding: roundMoney(wealthBuilding),
    wealthBuildingRate: summary.income > 0 ? roundMoney((wealthBuilding / summary.income) * 100) : 0,
  };
}

export function calculateEmergencyFund(currentInput: unknown, targetInput: unknown): EmergencyFundMetrics {
  const current = roundMoney(Math.max(0, toNumber(currentInput)));
  const target = roundMoney(Math.max(0, toNumber(targetInput)));
  const progressPercent = target > 0 ? roundMoney(Math.min(100, (current / target) * 100)) : 0;
  return {
    current,
    target,
    progressPercent,
    remaining: roundMoney(Math.max(0, target - current)),
  };
}

export function calculateYearOverYearPercent(currentInput: unknown, historicalAverageInput: unknown): number | null {
  const current = toNumber(currentInput);
  const historicalAverage = toNumber(historicalAverageInput);
  if (historicalAverage <= 0) return null;
  return roundMoney(((current - historicalAverage) / historicalAverage) * 100);
}

export function calculateSmartInsights(
  summary: LedgerSummary,
  categories: readonly CategoryAmount[],
  options: {
    availableCash?: number;
    emergencyRemaining?: number;
    dominantCategoryHistoricalAverage?: number;
    currentDominantCategoryAmount?: number;
  } = {},
): SmartInsights {
  const savings = calculateSavingsMetrics(summary);
  const dominantCategory = categories[0] ?? null;
  const insights: FinancialInsight[] = [];

  if (savings.directSavingsRate >= 20) {
    insights.push({ type: "POSITIVE", title: "קצב חיסכון טוב", text: `אתם חוסכים ישירות ${savings.directSavingsRate}% מההכנסה החודשית.` });
  } else if (savings.directSavingsRate > 0) {
    insights.push({ type: "ACTION", title: "יש מקום להגדיל חיסכון", text: `שיעור החיסכון הישיר הוא ${savings.directSavingsRate}%. אפילו תוספת קטנה וקבועה יכולה לשפר את החודש הבא.` });
  }

  if (dominantCategory) {
    const change = calculateYearOverYearPercent(options.currentDominantCategoryAmount ?? dominantCategory.amount, options.dominantCategoryHistoricalAverage ?? 0);
    insights.push({
      type: change !== null && change > 15 ? "WARNING" : "ACTION",
      title: `ההוצאה המובילה: ${dominantCategory.categoryName}`,
      text: change !== null && change > 15
        ? `הקטגוריה גבוהה ב-${Math.round(change)}% מהממוצע ההיסטורי הזמין. כדאי לבדוק מה השתנה.`
        : `הקטגוריה מהווה את מוקד ההוצאה המרכזי החודש, עם ${formatMoney(dominantCategory.amount)} ₪.`,
    });
  }

  if ((options.availableCash ?? 0) > 0 && (options.emergencyRemaining ?? 0) > 0) {
    const allocation = Math.min(options.availableCash ?? 0, options.emergencyRemaining ?? 0);
    insights.push({ type: "ACTION", title: "הזדמנות לקרן החירום", text: `נשארו ${formatMoney(options.availableCash ?? 0)} ₪ פנויים. ניתן להפנות עד ${formatMoney(allocation)} ₪ לקרן החירום בלי לעבור את היעד.` });
  }

  return { savings, dominantCategory, insights: insights.slice(0, 3) };
}

function formatMoney(value: number) {
  return Math.round(value).toLocaleString("he-IL");
}

export function roundMoney(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}
