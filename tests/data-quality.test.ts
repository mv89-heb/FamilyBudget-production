import assert from "node:assert/strict";
import test from "node:test";
import { averageKnownValues, canCompareHistory, financialValue, historicalSeries, historyStatus } from "@/lib/data-quality";
import { formatFinancialValue } from "@/lib/financial-display";

test("zero is represented as a real zero, not missing data", () => {
  const value = financialValue(0, "LEDGER");

  assert.equal(value.status, "REAL_ZERO");
  assert.equal(value.value, 0);
  assert.equal(formatFinancialValue(value).text, "‏0 ‏₪");
});

test("missing financial data never becomes zero", () => {
  const value = financialValue(null, "BANK");
  const display = formatFinancialValue(value);

  assert.equal(value.value, null);
  assert.equal(value.status, "NO_DATA");
  assert.equal(display.text, "—");
  assert.equal(display.secondaryText, "טרם דווח");
});

test("partial data keeps the known amount while exposing uncertainty", () => {
  const value = financialValue(2340, "BANK", { partial: true });
  const display = formatFinancialValue(value);

  assert.equal(value.status, "PARTIAL_DATA");
  assert.equal(display.isKnown, true);
  assert.equal(display.secondaryText, "תמונת מצב חלקית");
});

test("historical gaps remain gaps and are not converted to zero", () => {
  const series = historicalSeries([
    { period: "2026-04", value: 2000 },
    { period: "2026-05", value: null },
    { period: "2026-06", value: 2400 },
  ], 3);

  assert.equal(series.points[1].value, null);
  assert.equal(series.points[1].status, "NO_DATA");
  assert.equal(series.availablePeriods, 2);
  assert.equal(canCompareHistory(series, 3), false);
  assert.equal(historyStatus(series, 3), "INSUFFICIENT_HISTORY");
});

test("known-value average ignores missing periods", () => {
  const series = historicalSeries([
    { period: "2026-04", value: 2000 },
    { period: "2026-05", value: null },
    { period: "2026-06", value: 2400 },
  ]);

  assert.equal(averageKnownValues(series), 2200);
});
