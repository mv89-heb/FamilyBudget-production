import test from "node:test";
import assert from "node:assert/strict";
import { calculateDebtToIncomeRatio, calculateMortgageMonthlyFlows } from "@/lib/mortgage-report";

test("mortgage report averages only the requested completed months", () => {
  const rows = [
    { type: "INCOME" as const, kind: "STANDARD", amount: 18000, transactionDate: new Date("2026-08-10T12:00:00Z") },
    { type: "EXPENSE" as const, kind: "STANDARD", amount: 9000, transactionDate: new Date("2026-08-11T12:00:00Z"), category: { name: "דיור" } },
    { type: "EXPENSE" as const, kind: "LOAN_PRINCIPAL", amount: 3000, transactionDate: new Date("2026-08-12T12:00:00Z"), category: { name: "הלוואה" } },
    { type: "EXPENSE" as const, kind: "STANDARD", amount: 4500, transactionDate: new Date("2026-09-10T12:00:00Z"), category: { name: "חיוב כרטיסי אשראי" } },
    { type: "INCOME" as const, kind: "STANDARD", amount: 20000, transactionDate: new Date("2026-09-10T12:00:00Z") },
  ];
  const result = calculateMortgageMonthlyFlows(rows, ["2026-08", "2026-09", "2026-10"]);
  assert.deepEqual(result.months.map((row) => row.income), [18000, 20000, 0]);
  assert.deepEqual(result.months.map((row) => row.operatingExpenses), [9000, 0, 0]);
  assert.deepEqual(result.months.map((row) => row.debtPayments), [3000, 0, 0]);
  assert.equal(result.averages.income, 12666.67);
  assert.equal(result.averages.debtPayments, 1000);
});

test("mortgage report excludes credit-card settlements to avoid double counting", () => {
  const result = calculateMortgageMonthlyFlows([
    { type: "EXPENSE", kind: "STANDARD", amount: 6000, transactionDate: new Date("2026-10-10T12:00:00Z"), category: { name: "חיוב כרטיסי אשראי" } },
  ], ["2026-10"]);
  assert.equal(result.averages.operatingExpenses, 0);
  assert.equal(result.averages.debtPayments, 0);
});

test("debt-to-income ratio is safe when income is missing", () => {
  assert.equal(calculateDebtToIncomeRatio(3000, 0), null);
  assert.equal(calculateDebtToIncomeRatio(3000, 15000), 20);
});
