import test from "node:test";
import assert from "node:assert/strict";

test("Excel import hardening contracts are present", async () => {
  const response = await fetch("https://raw.githubusercontent.com/mv89-heb/FamilyBudget-production/hardening/import-parser-and-security/app/api/import/excel/route.ts");
  assert.equal(response.ok, true);
  const source = await response.text();
  assert.match(source, /SENSITIVE_HEADER/);
  assert.match(source, /redactForGemini/);
  assert.match(source, /extractSheetRows/);
  assert.match(source, /map\.type === undefined/);
  assert.match(source, /type = \"EXPENSE\"/);
  assert.match(source, /type = \"INCOME\"/);
});
