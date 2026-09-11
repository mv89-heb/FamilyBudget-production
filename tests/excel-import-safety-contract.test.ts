import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("Excel import safety contract", () => {
  const source = readFileSync(join(process.cwd(), "app/api/import/excel/route.ts"), "utf8");
  for (const contract of [
    "SENSITIVE_HEADER",
    "redactForGemini",
    "extractSheetRows",
    "hasDebitCredit",
    "legacyKey",
    "legacyTransactions",
    "legacyMatches",
    "fingerprint: null",
  ]) assert.ok(source.includes(contract));
});
