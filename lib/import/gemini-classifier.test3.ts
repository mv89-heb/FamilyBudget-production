import assert from "node:assert/strict";
import test from "node:test";
import { classifyTransactions } from "./gemini-classifier";

test("classifier rules", async () => {
  const result = await classifyTransactions([{ date: "2026-01-01", amount: 1200, type: "EXPENSE", description: "ישראכרט" }], "BANK");
  assert.equal(result[0].kind, "TRANSFER");
});
