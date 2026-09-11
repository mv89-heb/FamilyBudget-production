import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("Excel import UI exposes idempotent and updated-row results", () => {
  const importPage = readFileSync(join(process.cwd(), "app/import/page.tsx"), "utf8");
  const historyApi = readFileSync(join(process.cwd(), "app/api/import/history/route.ts"), "utf8");
  const historyPage = readFileSync(join(process.cwd(), "app/import/history/page.tsx"), "utf8");

  for (const contract of ["rowsUpdated", "alreadyProcessed", "לא נוצרו כפילויות", "מניעת כפילויות בייבוא חוזר"]) assert.ok(importPage.includes(contract));
  for (const contract of ["rowsDetected", "rowsAnalyzed", "rowsUpdated", "errorMessage", "completedAt"]) assert.ok(historyApi.includes(contract));
  for (const contract of ["עודכנו", "שורות שזוהו", "errorMessage"]) assert.ok(historyPage.includes(contract));
});
