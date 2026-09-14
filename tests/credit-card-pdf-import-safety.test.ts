import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("Credit-card PDF import privacy and dedupe contract", () => {
  const route = readFileSync(join(process.cwd(), "app/api/import/credit-card-pdf/route.ts"), "utf8");
  const privacy = readFileSync(join(process.cwd(), "lib/import/privacy.ts"), "utf8");
  for (const contract of [
    "sanitizeImportText",
    "const parsed = await pdfParse(buffer)",
    "const text = sanitizeImportText(parsed.text || \"\")",
    "requestGemini(page)",
    "fingerprint(row)",
    "fileHash",
    "creditCardIdentityMatches",
    "installmentNumber",
    "installmentTotal",
  ]) assert.ok(route.includes(contract), `missing PDF privacy/dedupe contract: ${contract}`);

  for (const marker of ["CARD_REDACTED", "ACCOUNT_REDACTED", "CODE_REDACTED", "ID_REDACTED", "PHONE_REDACTED", "EMAIL_REDACTED"]) {
    assert.ok(privacy.includes(marker), `missing privacy redaction marker: ${marker}`);
  }

  assert.ok(!route.includes("requestGemini(buffer"), "raw PDF buffer must never be sent to Gemini");
  assert.ok(!route.includes("requestGemini(parsed.text"), "unsanitized PDF text must never be sent to Gemini");
});
