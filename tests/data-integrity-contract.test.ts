import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("data integrity monthly flow contract accounts for refunds", () => {
  const source = readFileSync(join(process.cwd(), "app/api/data-integrity/route.ts"), "utf8");

  for (const contract of [
    'row.kind === "REFUND"',
    "const refunds =",
    "const netExpenses = expenses - refunds",
    "grossExpenses: expenses",
    "refunds,",
    "expenses: netExpenses",
  ]) {
    assert.ok(source.includes(contract), `Missing contract: ${contract}`);
  }
});
