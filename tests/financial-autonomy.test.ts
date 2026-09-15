import test from "node:test";
import assert from "node:assert/strict";
import { calculateAmortizationSchedule, calculateNetWorth, calculateReconciliationDifference, calculateMonthlySinkingContribution, forecastMonths } from "@/lib/financial-control";
import { matchesRule, resolveClassificationRule } from "@/lib/rules-engine";

test("rules engine honors priority and match mode", () => {
  assert.equal(matchesRule({ pattern: "מיטב", matchType: "CONTAINS" }, "הפקדה מיטב דש"), true);
  const rule = resolveClassificationRule([
    { pattern: "מיטב", matchType: "CONTAINS", categoryId: "generic", priority: 100, active: true },
    { pattern: "מיטב דש", matchType: "CONTAINS", categoryId: "specific", priority: 10, active: true },
  ], ["הפקדה מיטב דש גמל"]);
  assert.equal(rule?.categoryId, "specific");
});

test("net worth is assets minus liabilities", () => {
  assert.deepEqual(calculateNetWorth([100000, 25000], [60000, 5000]), { assets: 125000, liabilities: 65000, netWorth: 60000 });
});

test("reconciliation difference is bank minus ledger", () => {
  assert.equal(calculateReconciliationDifference(8420, 8300), -120);
});

test("sinking fund contribution is spread across remaining months", () => {
  assert.equal(calculateMonthlySinkingContribution(3600, 600, new Date("2027-09-01T00:00:00Z"), new Date("2026-09-01T00:00:00Z")), 300);
});

test("amortization separates principal from interest", () => {
  const rows = calculateAmortizationSchedule({ principal: 10000, annualRate: 12, monthlyPayment: 1000, startDate: new Date("2026-10-01T00:00:00Z"), maxMonths: 2 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].interest, 100);
  assert.equal(rows[0].principal, 900);
  assert.equal(rows[0].balanceAfter, 9100);
});

test("forecast marks a negative month as deficit", () => {
  const rows = forecastMonths([{ month: "2026-10", recurringIncome: 10000, recurringExpenses: 9500, sinkingContributions: 600 }]);
  assert.equal(rows[0].netCashFlow, -100);
  assert.equal(rows[0].status, "DEFICIT");
});
