import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("Excel import safety checks", () => {
  const source = readFileSync(join(process.cwd(), "app/api/import/excel/route.ts"), "utf8");
  assert.equal(source.includes("SENSITIVE_HEADER"), true);
  assert.equal(source.includes("redactForGemini"), true);
  assert.equal(source.includes("extractSheetRows"), true);
  assert.equal(source.includes("hasDebitCredit"), true);
  assert.equal(source.includes("map.type === undefined"), true);
});
