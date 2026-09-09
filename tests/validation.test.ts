import test from "node:test";
import assert from "node:assert/strict";
import { monthSchema, paymentMethodSchema, transactionSchema } from "../lib/validation";

test("accepts a valid month", () => {
  assert.equal(monthSchema.parse("2026-09"), "2026-09");
});

test("rejects invalid months", () => {
  assert.throws(() => monthSchema.parse("2026-13"));
  assert.throws(() => monthSchema.parse("2026-00"));
  assert.throws(() => monthSchema.parse("26-09"));
});

test("accepts exactly four digits for masked payment methods", () => {
  assert.equal(paymentMethodSchema.parse({ type: "CARD", nickname: "ויזה", last4: "1234" }).last4, "1234");
  assert.throws(() => paymentMethodSchema.parse({ type: "CARD", nickname: "ויזה", last4: "123" }));
  assert.throws(() => paymentMethodSchema.parse({ type: "CARD", nickname: "ויזה", last4: "abcd" }));
});

test("rejects card data on cash methods", () => {
  assert.throws(() => paymentMethodSchema.parse({ type: "CASH", nickname: "מזומן", last4: "1234" }));
});

test("accepts valid transaction input", () => {
  const value = transactionSchema.parse({ type: "EXPENSE", amount: "125.50", transactionDate: "2026-09-09", categoryId: "cat_1", note: "קניות" });
  assert.equal(value.amount, 125.5);
});

test("rejects invalid transaction dates", () => {
  assert.throws(() => transactionSchema.parse({ type: "EXPENSE", amount: 10, transactionDate: "2026-02-30", categoryId: "cat_1" }));
});
