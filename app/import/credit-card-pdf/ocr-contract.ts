export const CREDIT_CARD_OCR_PRIVACY_CONTRACT = {
  rawPdfMustStayInBrowser: true,
  rawImageMustStayInBrowser: true,
  serverMayReceiveOnlyOcrText: true,
  serverMustSanitizeBeforeGemini: true,
  rawPdfMustNotBePersisted: true,
} as const;
