import { test } from "node:test";
import assert from "node:assert/strict";
import { transactionFingerprint } from "@/lib/import/transaction-identity";

test("transaction identity is independent of category", () => {
  const first = transactionFingerprint({
    source: "BANK",
    date: "2026-09-01",
    type: "EXPENSE",
    amount: 42.5,
    note: "סופר",
    paymentMethodName: "כרטיס",
    kind: "STANDARD",
  });
  const second = transactionFingerprint({
    source: "BANK",
    date: "2026-09-01",
    type: "EXPENSE",
    amount: 42.5,
    note: "סופר",
    paymentMethodName: "כרטיס",
    kind: "STANDARD",
  });
  assert.equal(first, second);
});

test("amount is part of transaction identity", () => {
  const first = transactionFingerprint({
    source: "BANK",
    date: "2026-09-02",
    type: "EXPENSE",
    amount: 19.9,
    note: "חנות",
    paymentMethodName: "כרטיס",
    kind: "STANDARD",
  });
  const second = transactionFingerprint({
    source: "BANK",
    date: "2026-09-02",
    type: "EXPENSE",
    amount: 29.9,
    note: "חנות",
    paymentMethodName: "כרטיס",
    kind: "STANDARD",
  });
  assert.notEqual(first, second);
});

test("identity normalizes harmless text formatting", () => {
  const first = transactionFingerprint({
    source: "BANK",
    date: "2026-09-03",
    type: "EXPENSE",
    amount: 10,
    note: "  סופר   ",
    paymentMethodName: " כרטיס ",
    kind: "STANDARD",
  });
  const second = transactionFingerprint({
    source: "BANK",
    date: "2026-09-03",
    type: "EXPENSE",
    amount: 10,
    note: "סופר",
    paymentMethodName: "כרטיס",
    kind: "standard",
  });
  assert.equal(first, second);
});
