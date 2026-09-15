import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateBudgetStatus,
  calculateCategoryBreakdown,
  calculateEmergencyFund,
  calculateLedgerSummary,
  calculateSavingsMetrics,
  calculateSmartInsights,
  type LedgerTransaction,
} from "@/lib/ledger-engine";

const tx = (input: Partial<LedgerTransaction> & Pick<LedgerTransaction, "type" | "kind" | "amount">): LedgerTransaction => input;

test("category breakdown is deterministic and includes engine-owned shares", () => {
  const rows = calculateCategoryBreakdown([
    tx({ type: "EXPENSE", kind: "STANDARD", amount: 300, categoryId: "food", categoryName: "מזון" }),
    tx({ type: "EXPENSE", kind: "STANDARD", amount: 100, categoryId: "fuel", categoryName: "דלק" }),
  ]);
  assert.equal(rows[0].categoryName, "מזון");
  assert.equal(rows[0].sharePercent, 75);
  assert.equal(rows[1].sharePercent, 25);
  assert.equal(rows[1].startPercent, 75);
});

test("budget status exposes stable warning and overage states", () => {
  assert.equal(calculateBudgetStatus(1000, 700).status, "GOOD");
  assert.equal(calculateBudgetStatus(1000, 850).status, "WARNING");
  const over = calculateBudgetStatus(1000, 1250);
  assert.equal(over.status, "OVER");
  assert.equal(over.overage, 250);
  assert.equal(over.progressPercent, 100);
});

test("savings metrics count explicit savings plus principal repayment as wealth building", () => {
  const rows = [
    tx({ type: "INCOME", kind: "STANDARD", amount: 10000 }),
    tx({ type: "EXPENSE", kind: "STANDARD", amount: 6000 }),
    tx({ type: "EXPENSE", kind: "LOAN_PRINCIPAL", amount: 1000, categoryName: "החזר הלוואה" }),
    tx({ type: "EXPENSE", kind: "STANDARD", amount: 4000, categoryName: "חיסכון" }),
  ];
  const summary = calculateLedgerSummary(rows);
  const metrics = calculateSavingsMetrics(summary, rows);
  assert.equal(metrics.directSavings, 4000);
  assert.equal(metrics.directSavingsRate, 40);
  assert.equal(metrics.wealthBuilding, 5000);
  assert.equal(metrics.wealthBuildingRate, 50);
});

test("emergency fund progress is capped at 100 percent", () => {
  assert.deepEqual(calculateEmergencyFund(40000, 30975), {
    current: 40000,
    target: 30975,
    progressPercent: 100,
    remaining: 0,
  });
});

test("smart insights identify the dominant category and savings opportunity", () => {
  const rows = [
    tx({ type: "INCOME", kind: "STANDARD", amount: 10000 }),
    tx({ type: "EXPENSE", kind: "STANDARD", amount: 4000, categoryId: "fuel", categoryName: "דלק" }),
    tx({ type: "EXPENSE", kind: "STANDARD", amount: 1000, categoryId: "food", categoryName: "מזון" }),
  ];
  const summary = calculateLedgerSummary(rows);
  const categories = calculateCategoryBreakdown(rows);
  const insights = calculateSmartInsights(summary, categories, {
    dominantCategoryHistoricalAverage: 2500,
    currentDominantCategoryAmount: 4000,
  });
  assert.equal(insights.dominantCategory?.categoryName, "דלק");
  assert.equal(insights.insights.some((item) => item.type === "WARNING"), true);
});
