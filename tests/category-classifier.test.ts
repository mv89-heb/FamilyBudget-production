import assert from "node:assert/strict";
import test from "node:test";

import { classifyTransactionPresentation } from "../lib/category-classifier";

test("credit-card settlement is cash flow detail, not essential consumption", () => {
  const result = classifyTransactionPresentation("אחר", 'ישראכרט בע"מ');
  assert.equal(result.name, "חיובי כרטיסי אשראי");
  assert.equal(result.isCreditCardPayment, true);
  assert.equal(result.isEssential, false);
  assert.equal(result.isSavings, false);
});

test("debt settlement is classified without inventing principal", () => {
  const result = classifyTransactionPresentation("אחר", "-בנק יהב-אשראי");
  assert.equal(result.name, "תשלומי חוב");
  assert.equal(result.isDebt, true);
  assert.equal(result.isEssential, true);
});

test("savings and pension transfers are not consumption", () => {
  const deposit = classifyTransactionPresentation("אחר", "הפקדה לפקדון/מובייל");
  const pension = classifyTransactionPresentation("אחר", "כלל השתלמות כלל");
  assert.equal(deposit.isSavings, true);
  assert.equal(deposit.isEssential, false);
  assert.equal(pension.isSavings, true);
  assert.equal(pension.isEssential, false);
});

test("essential recurring categories are recognized", () => {
  assert.equal(classifyTransactionPresentation("אחר", 'מי שמש בע"מ').name, "מים");
  assert.equal(classifyTransactionPresentation("אחר", "פאמפי בע\"מ").name, "דלק");
  assert.equal(classifyTransactionPresentation("אחר", "עיריית בית שמש").name, "ארנונה");
  assert.equal(classifyTransactionPresentation("אחר", "הראל בטוח").name, "ביטוחים");
});
