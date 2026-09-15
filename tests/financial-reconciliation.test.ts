import assert from "node:assert/strict";
import test from "node:test";
import { analyzeTransactionFingerprints } from "../lib/financial-reconciliation";

test("unique legacy transaction is safe to backfill", () => {
  const result = analyzeTransactionFingerprints([
    { id: "a", date: "2026-08-10", type: "EXPENSE", amount: 42, note: "Coffee", paymentMethodName: "Bank" },
  ], "BANK");

  assert.equal(result[0]?.status, "SAFE_BACKFILL");
  assert.ok(result[0]?.fingerprint);
});

test("identical legacy rows are collision candidates, never auto-backfilled", () => {
  const result = analyzeTransactionFingerprints([
    { id: "a", date: "2026-08-16", type: "EXPENSE", amount: 100, note: "מיטב דש גמל ופנ", paymentMethodName: "בנק יהב" },
    { id: "b", date: "2026-08-16", type: "EXPENSE", amount: 100, note: "מיטב דש גמל ופנ", paymentMethodName: "בנק יהב" },
  ], "BANK");

  assert.deepEqual(result.map((row) => row.status), ["COLLISION", "COLLISION"]);
  assert.deepEqual(result[0]?.collisionIds, ["a", "b"]);
});

test("stored matching fingerprint is already reconciled", () => {
  const first = analyzeTransactionFingerprints([
    { id: "a", date: "2026-08-10", type: "EXPENSE", amount: 42, note: "Coffee", paymentMethodName: "Bank" },
  ], "BANK")[0];
  assert.ok(first?.fingerprint);

  const result = analyzeTransactionFingerprints([
    { id: "a", date: "2026-08-10", type: "EXPENSE", amount: 42, note: "Coffee", paymentMethodName: "Bank", fingerprint: first.fingerprint },
  ], "BANK");

  assert.equal(result[0]?.status, "ALREADY_MATCHED");
});
