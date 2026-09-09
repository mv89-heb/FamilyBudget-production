import { test } from "node:test";
import assert from "node:assert/strict";

test("build sanity marker", () => {
  assert.equal(typeof "FamilyBudget", "string");
});
