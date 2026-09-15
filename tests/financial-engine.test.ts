import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateCreditCardNetExpense,
  calculateDebtPayments,
  calculateFinancingActivity,
  calculateNetExpense,
  calculateOperatingIncome,
  getIsraelMonth,
  monthRange,
  signedCreditCardAmount,
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

test("legacy STANDARD debt can count toward debt burden without becoming principal", () => {
  const transactions = [
    { type: "EXPENSE", kind: "STANDARD", amount: 1389.93, note: "-בנק יהב-אשראי" },
    { type: "EXPENSE", kind: "STANDARD", amount: 1101.19, note: "-בנק יהב-אשראי" },
    { type: "EXPENSE", kind: "LOAN_PRINCIPAL", amount: 1473.62 },
  ];
  const isLegacyDebt = (transaction: Parameters<typeof calculateDebtPayments>[0][number]) => transaction.kind === "STANDARD" && Boolean(transaction.note?.includes("יהב-אשראי"));

  assert.equal(calculateDebtPayments(transactions, isLegacyDebt), 3964.74);
  assert.equal(transactions.filter(transaction => transaction.kind === "LOAN_PRINCIPAL").reduce((total, transaction) => total + transaction.amount, 0), 1473.62);
});

test("credit card charges and refunds produce net card expense", () => {
  const transactions = [
    { type: "CHARGE", kind: "PURCHASE", amount: 500 },
    { type: "CHARGE", kind: "INSTALLMENT", amount: 120 },
    { type: "CHARGE", kind: "FEE", amount: 15 },
    { type: "REFUND", kind: "REFUND", amount: 200 },
  ];

  assert.equal(calculateCreditCardNetExpense(transactions), 435);
  assert.equal(signedCreditCardAmount(transactions[3]), -200);
});

test("credit card bank settlement is not a card expense", () => {
  const settlement = { type: "TRANSFER", kind: "OTHER", amount: 635 };
  assert.equal(signedCreditCardAmount(settlement), 0);
  assert.equal(calculateCreditCardNetExpense([settlement]), 0);
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
