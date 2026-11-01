import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("Excel import safety contract", () => {
  const source = readFileSync(join(process.cwd(), "app/api/import/excel/route.ts"), "utf8");
  for (const contract of [
    "account number",
    "redactRows",
    "sourceFileHash",
    "ImportSource",
    "CREDIT_CARD",
    "fingerprint",
  ]) assert.ok(source.includes(contract), `missing import safety contract: ${contract}`);
});

test("Import UI requires an explicit source", () => {
  const source = readFileSync(join(process.cwd(), "app/import/page.tsx"), "utf8");
  for (const contract of ["BANK", "CREDIT_CARD", "fd.append(\"source\", source)", "דוח בנק", "פירוט כרטיס אשראי"]) assert.ok(source.includes(contract), `missing UI source contract: ${contract}`);
});

test("Failed imports can be safely reclaimed and Gemini upstream failures are distinguished", () => {
  const source = readFileSync(join(process.cwd(), "app/api/import/excel/route.ts"), "utf8");
  for (const contract of [
    'prior?.status === "FAILED"',
    'where: { id: prior.id, status: "FAILED" }',
    'reclaimed.count !== 1',
    'createError.code === "P2002"',
    "GEMINI_UPSTREAM_UNAVAILABLE",
    "GEMINI_TIMEOUT_MS = 12_000",
    'type: "OBJECT"',
    'type: "INTEGER"',
    "nullable: true",
  ]) assert.ok(source.includes(contract), `missing retry/resilience contract: ${contract}`);
  assert.ok(!source.includes('type: ["integer", "null"]'), "Gemini Schema must not use JSON Schema union types");
  assert.ok(source.includes('const hasDebitCredit = source === "BANK" &&'), "a single credit-card amount column must not be treated as a bank debit/credit pair");
  assert.ok(source.includes('source === "BANK" && map.type === undefined'), "bank imports must still require a transaction type unless debit/credit columns exist");
  assert.ok(source.includes('sheetRows.slice(0, 16).map'), "Excel import must search for headers below introductory rows");
  assert.ok(source.includes('workbook.SheetNames.flatMap'), "Excel import must inspect worksheets independently");
});

test("Import history explains partial and missing-month PDF results", () => {
  const source = readFileSync(join(process.cwd(), "app/import/history/page.tsx"), "utf8");
  for (const contract of ["MISSING_MONTHS:", "GEMINI_PARTIAL:", "PROCESSING_TIMEOUT", "PDF_TEXT_EMPTY", "explainImportMessage"]) {
    assert.ok(source.includes(contract), `missing import history explanation: ${contract}`);
  }
});
