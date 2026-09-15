import { describe, expect, test } from "vitest";
import { classifyTransactions } from "./gemini-classifier";

describe("centralized transaction classifier", () => {
  test("classifies deterministic bank rules without Gemini", async () => {
    const result = await classifyTransactions([
      { date: "2026-01-01", amount: 1200, type: "EXPENSE", description: "ישראכרט", note: null },
      { date: "2026-01-02", amount: 300, type: "EXPENSE", description: "משיכת מזומן", note: null },
      { date: "2026-01-03", amount: 4000, type: "EXPENSE", description: "לאומי למשכנתאות", note: null }
    ], "BANK");

    expect(result.map(item => item.kind)).toEqual(["TRANSFER", "CASH_WITHDRAWAL", "LOAN_PRINCIPAL"]);
    expect(result[0].categoryName).toBe("חיובי כרטיסי אשראי");
    expect(result[1].categoryName).toBe("משיכת מזומן");
    expect(result[2].categoryName).toBe("דיור והתחייבויות");
  });

  test("does not call Gemini for deterministic credit-card refunds", async () => {
    const result = await classifyTransactions([
      { date: "2026-01-01", amount: 80, type: "INCOME", description: "זיכוי עסקה", note: null }
    ], "CREDIT_CARD");
    expect(result[0].kind).toBe("REFUND");
    expect(result[0].confidence).toBeGreaterThanOrEqual(0.95);
  });
});
