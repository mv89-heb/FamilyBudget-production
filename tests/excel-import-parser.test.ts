import test from "node:test";
import assert from "node:assert/strict";
import { detectHeaders, excelDate, localNormalize, numericAmount, sanitizePaymentMethod } from "../lib/import/excel-parser";

test("detects common Hebrew credit-card statement headers", () => {
  const headers = ["תאריך העסקה", "שם בית העסק", "סכום העסקה", "תאריך חיוב", "כרטיס"];
  const map = detectHeaders(headers);
  assert.equal(map.date, 0);
  assert.equal(map.description, 1);
  assert.equal(map.amount, 2);
  assert.equal(map.paymentMethod, 4);
});

test("parses Israeli day-first dates including two-digit years and timestamps", () => {
  assert.equal(excelDate("01/09/26"), "2026-09-01");
  assert.equal(excelDate("31.12.2025 23:59"), "2025-12-31");
  assert.equal(excelDate("2026-09-01T12:30:00"), "2026-09-01");
  assert.equal(excelDate("31/02/2026"), null);
});

test("parses decimal comma, thousands separators, currency symbols and refunds", () => {
  assert.equal(numericAmount("123,45"), 123.45);
  assert.equal(numericAmount("1.234,56"), 1234.56);
  assert.equal(numericAmount("1,234.56"), 1234.56);
  assert.equal(numericAmount("₪ 45.90"), 45.9);
  assert.equal(numericAmount("(45,90)"), -45.9);
  assert.equal(numericAmount("לא סכום"), null);
});

test("normalizes a Hebrew credit-card sheet without a transaction-type column", () => {
  const rows = [
    ["תאריך העסקה", "שם בית העסק", "סכום העסקה", "תאריך חיוב", "כרטיס"],
    ["01/09/26", "סופר לדוגמה", "123,45", "02/09/26", "Visa 6752"],
    ["03/09/26", "החזר לדוגמה", "(45,90)", "04/09/26", "Visa 6752"],
  ];
  const normalized = localNormalize(rows, detectHeaders(rows[0]), "CREDIT_CARD");
  assert.equal(normalized?.length, 2);
  assert.deepEqual(normalized?.map(row => row.date), ["2026-09-01", "2026-09-03"]);
  assert.deepEqual(normalized?.map(row => row.amount), [123.45, 45.9]);
  assert.deepEqual(normalized?.map(row => row.type), ["EXPENSE", "INCOME"]);
  assert.equal(normalized?.[0].note, "סופר לדוגמה");
  assert.equal(normalized?.[0].paymentMethodName, "Visa 6752");
});

test("bank imports still require a type column unless debit and credit columns exist", () => {
  const rows = [["תאריך", "סכום"], ["01/09/2026", "20,00"]];
  assert.equal(localNormalize(rows, detectHeaders(rows[0]), "BANK"), null);
  assert.equal(localNormalize(rows, detectHeaders(rows[0]), "CREDIT_CARD")?.length, 1);
});

test("prefers the purchase date over an earlier billing-date column", () => {
  const headers = ["תאריך חיוב", "תאריך העסקה", "שם בית העסק", "סכום העסקה"];
  assert.equal(detectHeaders(headers).date, 1);
});

test("masks full card numbers before saving a payment method", () => {
  assert.equal(sanitizePaymentMethod("Visa 1234 5678 9012 3456"), "Visa •••• 3456");
  assert.equal(sanitizePaymentMethod("1234-5678-9012-3456"), "•••• 3456");
  assert.equal(sanitizePaymentMethod("Visa 6752"), "Visa 6752");
});

test("does not save redaction placeholders as payment-method nicknames", () => {
  assert.equal(sanitizePaymentMethod("[REDACTED]"), "");
  assert.equal(sanitizePaymentMethod(" [REDACTED] "), "");
});

test("credit-card normalization never retains a full card number from the card column", () => {
  const rows = [
    ["תאריך העסקה", "שם בית העסק", "סכום העסקה", "כרטיס"],
    ["01/09/26", "סופר לדוגמה", "123,45", "Visa 1234 5678 9012 3456"],
  ];
  const normalized = localNormalize(rows, detectHeaders(rows[0]), "CREDIT_CARD");
  assert.equal(normalized?.[0].paymentMethodName, "Visa •••• 3456");
});
