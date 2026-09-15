import assert from "node:assert/strict";
import test from "node:test";
import { classifyTransactions } from "../lib/import/gemini-classifier";

test("centralized classifier handles deterministic bank rules without Gemini", async () => {
  const result = await classifyTransactions([
    { date: "2026-01-01", amount: 1200, type: "EXPENSE", description: "ישראכרט", note: null },
    { date: "2026-01-02", amount: 300, type: "EXPENSE", description: "משיכת מזומן", note: null },
    { date: "2026-01-03", amount: 4000, type: "EXPENSE", description: "לאומי למשכנתאות", note: null }
  ], "BANK");

  assert.deepEqual(result.map(item => item.kind), ["TRANSFER", "CASH_WITHDRAWAL", "LOAN_PRINCIPAL"]);
  assert.equal(result[0].categoryName, "חיובי כרטיסי אשראי");
  assert.equal(result[1].categoryName, "משיכת מזומן");
  assert.equal(result[2].categoryName, "דיור והתחייבויות");
});

test("credit-card refunds are classified locally", async () => {
  const result = await classifyTransactions([
    { date: "2026-01-01", amount: 80, type: "INCOME", description: "זיכוי עסקה", note: null }
  ], "CREDIT_CARD");

  assert.equal(result[0].kind, "REFUND");
  assert.ok(result[0].confidence >= 0.95);
});

test("classifier preserves one-to-one row ordering", async () => {
  const result = await classifyTransactions([
    { date: "2026-01-01", amount: 100, type: "EXPENSE", description: "משיכת מזומן" },
    { date: "2026-01-02", amount: 200, type: "EXPENSE", description: "העברה לחשבון" }
  ], "BANK");

  assert.deepEqual(result.map(item => item.index), [0, 1]);
});
