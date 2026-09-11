import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("Excel import hardening contracts are present", () => {
  const source = readFileSync(join(process.cwd(), "app/api/import/excel/route.ts"), "utf8");
  assert.match(source, /SENSITIVE_HEADER/);
  assert.match(source, /redactForGemini/);
  assert.match(source, /extractSheetRows/);
  assert.match(source, /map\.type === undefined/);
  assert.match(source, /type = \"EXPENSE\"/);
  assert.match(source, /type = \"INCOME\"/);
});
