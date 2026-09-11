import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("Excel import safety contract", () => {
  const source = readFileSync(join(process.cwd(), "app/api/import/excel/route.ts"), "utf8");
  assert.ok(source.includes("SENSITIVE_HEADER"));
  assert.ok(source.includes("redactForGemini"));
  assert.ok(source.includes("extractSheetRows"));
  assert.ok(source.includes("hasDebitCredit"));
});
