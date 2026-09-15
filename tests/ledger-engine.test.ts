import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAutoBudgets,
  calculateBudgetSpending,
  calculateBudgetStatus,
  calculateCategoryAmounts,
  calculateLedgerSummary,
  calculateSavingsMetrics,
} from "../lib/ledger-engine";

test("ledger summary keeps operating results separate from financing", () => {
  const transactions = [
    { type: "INCOME", kind: "STANDARD", amount: 10000 },
    { type: "EXPENSE", kind: "STANDARD", amount: 4000 },
    { type: "INCOME", kind: "REFUND", amount: 250 },
    { type: "EXPENSE", kind: "LOAN_INTEREST", amount: 300 },
    { type: "EXPENSE", kind: "LOAN_PRINCIPAL", amount: 1200 },
    { type: "INCOME", kind: "LOAN_RECEIVED", amount: 5000 },
    { type: "EXPENSE", kind: "TRANSFER", amount: 900 },
  ];

  assert.deepEqual(calculateLedgerSummary(transactions), {
    income: 10000, operatingExpense: 4050, refunds: 250, debtPrincipal: 1200, debtInterest: 300, loanReceived: 5000,
    financingActivity: 6200, financingCashFlow: 3800, netCashFlow: 9750,
  });
});

test("category totals use the same accounting semantics as the ledger", () => {
  const rows = [
    { type: "EXPENSE", kind: "STANDARD", amount: 500, categoryId: "food", categoryName: "מזון" },
    { type: "INCOME", kind: "REFUND", amount: 100, categoryId: "food", categoryName: "מזון" },
    { type: "EXPENSE", kind: "LOAN_PRINCIPAL", amount: 1000, categoryId: "loan", categoryName: "הלוואה" },
    { type: "EXPENSE", kind: "STANDARD", amount: 300, categoryId: "fuel", categoryName: "דלק" },
  ];

  assert.deepEqual(calculateCategoryAmounts(rows), [
    { categoryId: "food", categoryName: "מזון", amount: 400 },
    { categoryId: "fuel", categoryName: "דלק", amount: 300 },
  ]);
});

test("budget status is deterministic and bounded for UI progress", () => {
  assert.deepEqual(calculateBudgetStatus(1000, 1250), {
    limit: 1000, spent: 1250, remaining: -250, overage: 250, percent: 125, progressPercent: 100, overBudget: true, status: "OVER",
  });
  assert.deepEqual(calculateBudgetStatus(0, 25), {
    limit: 0, spent: 25, remaining: -25, overage: 25, percent: 0, progressPercent: 0, overBudget: true, status: "OVER",
  });
});

test("budget spending ignores transfers, debt principal and card settlement rows", () => {
  const rows = [
    { type: "EXPENSE", kind: "STANDARD", amount: 200, categoryId: "food", categoryName: "מזון" },
    { type: "EXPENSE", kind: "TRANSFER", amount: 1000, categoryId: "transfer", categoryName: "העברה" },
    { type: "EXPENSE", kind: "LOAN_PRINCIPAL", amount: 800, categoryId: "loan", categoryName: "הלוואה" },
    { type: "EXPENSE", kind: "LOAN_INTEREST", amount: 50, categoryId: "loan", categoryName: "הלוואה" },
  ];
  const spending = calculateBudgetSpending(rows);
  assert.equal(spending.get("food"), 200);
  assert.equal(spending.get("loan"), 50);
  assert.equal(spending.get("transfer"), undefined);
});

test("direct savings never equals leftover cash", () => {
  const summary = calculateLedgerSummary([
    { type: "INCOME", kind: "STANDARD", amount: 18769 },
    { type: "EXPENSE", kind: "STANDARD", amount: 11137 },
  ]);
  const metrics = calculateSavingsMetrics(summary, [
    { type: "INCOME", kind: "STANDARD", amount: 18769, categoryName: "משכורת" },
    { type: "EXPENSE", kind: "STANDARD", amount: 11137, categoryName: "הוצאות שוטפות" },
  ]);
  assert.equal(metrics.directSavings, 0);
  assert.equal(metrics.wealthBuilding, 0);
  assert.equal(metrics.wealthBuildingRate, 0);
});

test("explicit savings transfers are counted without counting the remaining cash", () => {
  const summary = calculateLedgerSummary([{ type: "INCOME", kind: "STANDARD", amount: 10000 }, { type: "EXPENSE", kind: "STANDARD", amount: 6000 }]);
  const metrics = calculateSavingsMetrics(summary, [
    { type: "INCOME", kind: "STANDARD", amount: 10000, categoryName: "משכורת" },
    { type: "EXPENSE", kind: "STANDARD", amount: 6000, categoryName: "הוצאות" },
    { type: "EXPENSE", kind: "STANDARD", amount: 1000, categoryName: "חיסכון ופקדונות", note: "הפקדה לפיקדון" },
  ]);
  assert.equal(metrics.directSavings, 1000);
  assert.equal(metrics.wealthBuilding, 1000);
  assert.equal(metrics.directSavingsRate, 10);
});

test("auto budgets use exactly the previous three calendar months plus 5% and exclude non-consumption categories", () => {
  const rows = [
    { type: "EXPENSE", kind: "STANDARD", amount: 600, transactionDate: new Date("2026-06-10"), categoryId: "fuel", categoryName: "דלק" },
    { type: "EXPENSE", kind: "STANDARD", amount: 700, transactionDate: new Date("2026-07-10"), categoryId: "fuel", categoryName: "דלק" },
    { type: "EXPENSE", kind: "STANDARD", amount: 800, transactionDate: new Date("2026-08-10"), categoryId: "fuel", categoryName: "דלק" },
    { type: "EXPENSE", kind: "STANDARD", amount: 1000, transactionDate: new Date("2026-08-11"), categoryId: "save", categoryName: "חיסכון ופקדונות" },
    { type: "EXPENSE", kind: "LOAN_PRINCIPAL", amount: 900, transactionDate: new Date("2026-08-12"), categoryId: "loan", categoryName: "הלוואה" },
  ];
  const budgets = calculateAutoBudgets(rows, [
    { categoryId: "fuel", categoryName: "דלק" },
    { categoryId: "save", categoryName: "חיסכון ופקדונות" },
    { categoryId: "loan", categoryName: "הלוואה" },
  ], "2026-09", { safetyBufferPercent: 5 });
  assert.deepEqual(budgets, [{ categoryId: "fuel", categoryName: "דלק", averageLast3Months: 700, limit: 735, class: "VARIABLE" }]);
});
