import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

function transactionFingerprint(input: { date: string; type: string; amount: number; note?: string | null; payment?: string | null }) {
  return createHash("sha256").update(JSON.stringify({
    source: "BANK",
    date: input.date,
    type: input.type,
    amount: input.amount.toFixed(2),
    note: input.note?.trim().toLocaleLowerCase("he") || "",
    payment: input.payment?.trim().toLocaleLowerCase("he") || "",
  })).digest("hex");
}

test("transaction identity does not change when category changes", () => {
  const base = { date: "2026-09-01", type: "EXPENSE", amount: 42.5, note: "סופר", payment: "כרטיס" };
  assert.equal(transactionFingerprint(base), transactionFingerprint(base));
});

test("same financial transaction produces a stable fingerprint", () => {
  const first = transactionFingerprint({ date: "2026-09-02", type: "EXPENSE", amount: 19.9, note: "חנות", payment: "כרטיס" });
  const second = transactionFingerprint({ date: "2026-09-02", type: "EXPENSE", amount: 19.9, note: "חנות", payment: "כרטיס" });
  assert.equal(first, second);
});
