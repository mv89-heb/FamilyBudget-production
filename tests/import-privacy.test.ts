import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeImportText } from "../lib/import/privacy";

test("sanitizer removes common sensitive financial identifiers", () => {
  const input = "כרטיס 4580 1234 5678 9012 CVV: 123 ת.ז.: 123456789 050-1234567 user@example.com";
  const output = sanitizeImportText(input);
  assert.equal(output.includes("4580 1234 5678 9012"), false);
  assert.equal(output.includes("123456789"), false);
  assert.equal(output.includes("050-1234567"), false);
  assert.equal(output.includes("user@example.com"), false);
  assert.match(output, /\[CARD_REDACTED\]|\[ACCOUNT_REDACTED\]/);
  assert.match(output, /\[CODE_REDACTED\]/);
  assert.match(output, /\[ID_REDACTED\]/);
  assert.match(output, /\[PHONE_REDACTED\]/);
  assert.match(output, /\[EMAIL_REDACTED\]/);
});

test("sanitizer preserves transaction content", () => {
  const output = sanitizeImportText("01/09/2026 סופר פארם 125.90");
  assert.match(output, /סופר פארם/);
  assert.match(output, /125\.90/);
});
