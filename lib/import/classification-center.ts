import { classifyTransactions, type ClassificationInput, type TransactionClassification } from "./gemini-classifier";

export type { ClassificationInput, TransactionClassification };

/**
 * Single entry point for transaction classification.
 * Deterministic financial rules run first; Gemini handles unresolved rows in batches.
 */
export async function classificationCenter(rows: ClassificationInput[], source: "BANK" | "CREDIT_CARD") {
  if (!rows.length) return [];
  return classifyTransactions(rows, source);
}
