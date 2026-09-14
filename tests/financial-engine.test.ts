import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateDebtPayments,
  calculateFinancingActivity,
  calculateNetExpense,
  calculateOperatingIncome,
  getIsraelMonth,
  monthRange,
  signedOperatingAmount,
  sum,
  toNumber,
} from "../lib/financial-engine";

test("refunds reduce operating expense and are not ordinary income", () => {
  const transactions = [
    { type: "EXPENSE", kind: "STANDARD", amount: 1000 },
    { type: "INCOME", kind: "REFUND", amount: 300 },
    { type: "INCOME", kind: "STANDARD", amount: 5000 },
  ];

  assert.equal(calculateNetExpense(transactions), 700);
  assert.equal(calculateOperatingIncome(transactions), 5000);
  assert.equal(signedOperatingAmount(transactions[1]), -300);
});

test("financing and debt activity stay outside operating expense", () => {
  const transactions = [
    { type: "EXPENSE", kind: "STANDARD", amount: 100 },
    { type: "EXPENSE", kind: "LOAN_INTEREST", amount: 50 },
    { type: "EXPENSE", kind: "LOAN_PRINCIPAL", amount: 400 },
    { type: "INCOME", kind: "LOAN_RECEIVED", amount: 2000 },
    { type: "EXPENSE", kind: "TRANSFER", amount: 600 },
  ];

  assert.equal(calculateNetExpense(transactions), 150);
  assert.equal(calculateDebtPayments(transactions), 450);
  assert.equal(calculateFinancingActivity(transactions), 3000);
});

test("numeric normalization handles common database values safely", () => {
  assert.equal(toNumber(12.5), 12.5);
  assert.equal(toNumber("12.5"), 12.5);
  assert.equal(toNumber("not-a-number"), 0);
  assert.equal(toNumber(Infinity), 0);
  assert.equal(toNumber({ toNumber: () => "7.25" }), 7.25);
  assert.equal(sum([1, "2", { toNumber: () => 3 }, "bad"]), 6);
});

test("month range uses an exclusive next-month boundary", () => {
  const { start, end } = monthRange("2026-09");
  assert.equal(start.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(end.toISOString(), "2026-10-01T00:00:00.000Z");
});

test("Israel month conversion follows Asia/Jerusalem", () => {
  const beforeMidnightUtc = new Date("2026-09-30T21:30:00.000Z");
  const afterMidnightUtc = new Date("2026-10-01T21:30:00.000Z");
  assert.equal(getIsraelMonth(beforeMidnightUtc), "2026-10");
  assert.equal(getIsraelMonth(afterMidnightUtc), "2026-10");
});
