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
    "identityKey",
    "reimportMatches",
    "identityCandidates.length === 1",
    "fingerprint: null",
    "ImportSource",
    "CREDIT_CARD",
    "CreditCardTransaction",
    "creditCardFingerprint",
    "creditCardType",
    "kind = type === \"REFUND\" ? \"REFUND\" : \"PURCHASE\"",
    "fileHash = createHash(\"sha256\").update(`${source}:`).update(buffer).digest(\"hex\")",
  ]) assert.ok(source.includes(contract), `missing import safety contract: ${contract}`);
});

test("Import UI requires an explicit source", () => {
  const source = readFileSync(join(process.cwd(), "app/import/page.tsx"), "utf8");
  for (const contract of ["BANK", "CREDIT_CARD", "fd.append(\"source\", source)", "דוח בנק", "פירוט כרטיס אשראי"]) assert.ok(source.includes(contract), `missing UI source contract: ${contract}`);
});
