export const MAX_SANITIZED_IMPORT_CHARS = 1_000_000;

/**
 * Removes common financial/account identifiers before any AI processing.
 * This is intentionally server-side as a second privacy boundary even when
 * OCR/extraction already happened locally in the browser.
 *
 * maxChars remains optional so callers can deliberately impose a smaller
 * limit, while credit-card imports can preserve the full statement before
 * chunking and month-coverage validation.
 */
export function sanitizeImportText(input: string, maxChars = MAX_SANITIZED_IMPORT_CHARS): string {
  let text = input.replace(/\u0000/g, " ");

  text = text.replace(/\b(?:\d[ -]?){13,19}\b/g, "[CARD_REDACTED]");
  text = text.replace(/(?:מספר\s*(?:כרטיס|חשבון)|כרטיס\s*אשראי|account\s*(?:number|no\.? )|card\s*(?:number|no\.?))\s*[:#-]?\s*[\d\s-]{6,}/gi, "[ACCOUNT_REDACTED]");
  text = text.replace(/(?:cvv|cvc|קוד\s*אבטחה)\s*[:#-]?\s*\d{3,4}/gi, "[CODE_REDACTED]");
  text = text.replace(/(?:ת\.ז\.?|תעודת\s*זהות|id\s*(?:number|no\.?))\s*[:#-]?\s*\d{5,9}/gi, "[ID_REDACTED]");
  text = text.replace(/\b(?:\+?972[- .]?)?(?:0?5\d)[- .]?\d{3}[- .]?\d{4}\b/g, "[PHONE_REDACTED]");
  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL_REDACTED]");

  const normalized = text.replace(/\n{3,}/g, "\n\n").trim();
  return normalized.slice(0, Math.max(0, maxChars));
}
