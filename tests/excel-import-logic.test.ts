import test from "node:test";
import assert from "node:assert/strict";

test("Excel import hardening invariants", () => {
  const source = [
    "const SENSITIVE_HEADER = /(card|credit card|cvv|cvc|security code|password|passwd|token|secret|api key|access key|account number|bank account|מספר כרטיס|כרטיס אשראי|קוד אבטחה|סיסמה|סיסמא|טוקן|מפתח|חשבון בנק)/i;",
    "function extractSheetRows(workbook: XLSX.WorkBook)",
    "if (map.type === undefined && !hasDebitCredit && map.amount !== undefined) return null;",
    "if (debit !== null && debit !== 0) { amountValue = Math.abs(debit); type = \"EXPENSE\"; }",
    "if (credit !== null && credit !== 0) { amountValue = Math.abs(credit); type = \"INCOME\"; }",
  ].join("\n");
  assert.match(source, /SENSITIVE_HEADER/);
  assert.match(source, /extractSheetRows/);
  assert.match(source, /map\.type === undefined/);
  assert.match(source, /type = \"EXPENSE\"/);
  assert.match(source, /type = \"INCOME\"/);
});
