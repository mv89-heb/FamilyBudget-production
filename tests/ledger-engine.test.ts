import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBudgetSpending,
  calculateBudgetStatus,
  calculateCategoryAmounts,
  calculateLedgerSummary,
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
    income: 10000,
    operatingExpense: 4050,
    refunds: 250,
    debtPrincipal: 1200,
    debtInterest: 300,
    loanReceived: 5000,
    financingActivity: 6200,
    financingCashFlow: 3800,
    netCashFlow: 9750,
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
    limit: 1000,
    spent: 1250,
    remaining: -250,
    percent: 125,
    progressPercent: 100,
    overBudget: true,
  });
  assert.deepEqual(calculateBudgetStatus(0, 25), {
    limit: 0,
    spent: 25,
    remaining: -25,
    percent: 0,
    progressPercent: 0,
    overBudget: true,
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
