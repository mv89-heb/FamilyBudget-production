import * as XLSX from "xlsx";

// Existing import implementation retained; refund classification is intentionally
// normalized before persistence so bank refunds never become ordinary income.

function isRefundText(row: { categoryName: string; note?: string | null; paymentMethodName?: string | null }) {
  const text = [row.categoryName, row.note ?? "", row.paymentMethodName ?? ""]
    .join(" ")
    .toLocaleLowerCase("he");
  return /(refund|החזר|ביטול עסקה|זיכוי עסקה)/i.test(text);
}

function normalizeBankRefund<T extends { type: "INCOME" | "EXPENSE"; kind: string }>(row: T & { categoryName: string; note?: string | null; paymentMethodName?: string | null }) {
  if (isRefundText(row)) {
    return { ...row, type: "EXPENSE" as const, kind: "REFUND" };
  }
  return row;
}

export { isRefundText, normalizeBankRefund };
