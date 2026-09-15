import assert from "node:assert/strict";
import test from "node:test";
import { classifyTransactions } from "./gemini-classifier";

test("deterministic bank rules", async () => {
  const result = await classifyTransactions([
    { date: "2026-01-01", amount: 1200, type: "EXPENSE", description: "ישראכרט", note: null },
    { date: "2026-01-02", amount: 300, type: "EXPENSE", description: "משיכת מזומן", note: null },
    { date: "2026-01-03", amount: 4000, type: "EXPENSE", description: "לאומי למשכנתאות", note: null }
  ], "BANK");
  assert.deepEqual(result.map(item => item.kind), ["TRANSFER", "CASH_WITHDRAWAL", "LOAN_PRINCIPAL"]);
});

test("credit card refund", async () => {
  const result = await classifyTransactions([{ date: "2026-01-01", amount: 80, type: "INCOME", description: "זיכוי עסקה" }], "CREDIT_CARD");
  assert.equal(result[0].kind, "REFUND");
});
