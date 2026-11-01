import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("scanned PDF OCR partial results are not presented as fully completed", () => {
  const page = readFileSync(join(process.cwd(), "app/import/credit-card-pdf/page.tsx"), "utf8");

  assert.ok(page.includes("const ocrResult = ocrData as Result"), "OCR response should use the typed import result");
  assert.ok(page.includes("const ocrPartial = Boolean(ocrResult.partial)"), "OCR partial flag must be respected");
  assert.ok(page.includes('status: ocrPartial ? "הושלם חלקית" : "הושלם"'), "partial OCR must receive a partial UI status");
  assert.ok(page.includes("חלק מהטקסט לא נותח"), "the user must be warned when OCR analysis is incomplete");
});
