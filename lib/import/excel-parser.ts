import * as XLSX from "xlsx";

export type ImportSource = "BANK" | "CREDIT_CARD";
export type HeaderMap = { date?: number; amount?: number; type?: number; category?: number; paymentMethod?: number; note?: number; description?: number; debit?: number; credit?: number };
export type GeminiRow = { date: string; amount: number; type: "INCOME" | "EXPENSE"; categoryName: string; paymentMethodName: string | null; note: string | null };

export function normalizeHeader(value: unknown) {
  return String(value ?? "").replace(/^\uFEFF/, "").trim().toLocaleLowerCase("he").normalize("NFC").replace(/[\s_\-./]+/g, " ");
}
function findColumn(headers: unknown[], aliases: string[]) {
  const normalized = headers.map(normalizeHeader);
  const exact = normalized.findIndex(value => aliases.some(alias => value === alias));
  if (exact >= 0) return exact;
  const index = normalized.findIndex(value => aliases.some(alias => value.includes(alias)));
  return index >= 0 ? index : undefined;
}
export function detectHeaders(headers: unknown[]): HeaderMap {
  const aliases = {
    date: ["date", "transaction date", "purchase date", "תאריך העסקה", "תאריך עסקה", "תאריך הרכישה", "תאריך רכישה", "תאריך", "יום"],
    amount: ["transaction amount", "purchase amount", "amount ils", "amount", "סכום העסקה", "סכום עסקה", "סכום החיוב", "סכום חיוב", "סכום לתשלום", "סכום בשח", "סכום בש ח", "סכום", "total"],
    type: ["transaction type", "type", "סוג עסקה", "סוג תנועה", "סוג", "פעולה"],
    category: ["category", "קטגוריה", "סיווג"],
    paymentMethod: ["payment method", "payment", "אמצעי תשלום", "אמצעי", "כרטיס"],
    note: ["note", "notes", "הערה", "הערות"],
    description: ["merchant name", "merchant", "business name", "שם בית העסק", "שם בית עסק", "בית העסק", "בית עסק", "שם העסק", "שם ספק", "תיאור", "פרטים", "details", "description"],
    debit: ["debit", "withdrawal", "debit amount", "משיכה", "חיוב"],
    credit: ["credit", "deposit", "credit amount", "זיכוי", "הפקדה"]
  };
  return Object.fromEntries(Object.entries(aliases).map(([key, values]) => [key, findColumn(headers, values)])) as HeaderMap;
}

function validDate(year: number, month: number, day: number) {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : null;
}
export function excelDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) return validDate(parsed.y, parsed.m, parsed.d);
  }
  const text = String(value ?? "").trim().replace(/^["']|["']$/g, "");
  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/);
  if (iso) return validDate(+iso[1], +iso[2], +iso[3]);
  const local = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:[ T].*)?$/);
  if (!local) return null;
  const day = +local[1], month = +local[2];
  let year = +local[3];
  if (local[3].length === 2) year += year <= 49 ? 2000 : 1900;
  return validDate(year, month, day);
}
export function numericAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  let text = String(value ?? "").trim().replace(/[₪$€£\s\u00a0]/g, "").replace(/[−–]/g, "-");
  if (!text) return null;
  const negativeByBrackets = /^\(.*\)$/.test(text);
  if (negativeByBrackets) text = text.slice(1, -1);
  text = text.replace(/[^\d,.-]/g, "");
  if (!text || !/\d/.test(text)) return null;
  const comma = text.lastIndexOf(","), dot = text.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const thousands = decimal === "," ? /\./g : /,/g;
    text = text.replace(thousands, "").replace(decimal, ".");
  } else if (comma >= 0) {
    const decimals = text.length - comma - 1;
    text = decimals > 0 && decimals <= 2 ? text.replace(",", ".") : text.replace(/,/g, "");
  } else if (dot >= 0) {
    const decimals = text.length - dot - 1;
    if (decimals > 2) text = text.replace(/\./g, "");
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  return negativeByBrackets ? -Math.abs(parsed) : parsed;
}
function inferType(value: unknown, amount: number) {
  const text = String(value ?? "").trim().toLocaleLowerCase("he");
  if (/(income|credit|deposit|הכנסה|זיכוי|הפקדה)/i.test(text)) return "INCOME" as const;
  if (/(expense|debit|charge|payment|הוצאה|חיוב|תשלום)/i.test(text)) return "EXPENSE" as const;
  return amount < 0 ? "INCOME" as const : "EXPENSE" as const;
}
export function sanitizePaymentMethod(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.replace(/(?<!\d)\d(?:[\s-]*\d){11,18}(?![\s-]*\d)/g, match => {
    const digits = match.replace(/\D/g, "");
    return digits.length >= 12 && digits.length <= 19 ? "•••• " + digits.slice(-4) : match;
  });
}
export function localNormalize(rawRows: unknown[][], map = detectHeaders(rawRows[0] ?? []), source: ImportSource = "BANK"): GeminiRow[] | null {
  if (rawRows.length < 2) return [];
  const hasDebitCredit = source === "BANK" && (map.debit !== undefined || map.credit !== undefined);
  if (map.date === undefined || (map.amount === undefined && !hasDebitCredit) || (source === "BANK" && map.type === undefined && !hasDebitCredit)) return null;
  const rows: GeminiRow[] = [];
  for (const raw of rawRows.slice(1, 5001)) {
    const date = excelDate(raw[map.date]); if (!date) continue;
    let amount: number | null = null; let type: "INCOME" | "EXPENSE";
    if (hasDebitCredit) {
      const debit = map.debit === undefined ? null : numericAmount(raw[map.debit]);
      const credit = map.credit === undefined ? null : numericAmount(raw[map.credit]);
      if (debit !== null && debit !== 0) { amount = Math.abs(debit); type = "EXPENSE"; }
      else if (credit !== null && credit !== 0) { amount = Math.abs(credit); type = "INCOME"; }
      else continue;
    } else {
      amount = numericAmount(raw[map.amount!]);
      if (amount === null || amount === 0) continue;
      type = inferType(map.type === undefined ? "" : raw[map.type], amount);
    }
    const category = map.category === undefined ? "" : String(raw[map.category] ?? "").trim();
    const description = map.description === undefined ? "" : String(raw[map.description] ?? "").trim();
    const note = map.note === undefined ? description : String(raw[map.note] ?? "").trim();
    const payment = map.paymentMethod === undefined ? "" : sanitizePaymentMethod(raw[map.paymentMethod]);
    rows.push({ date, amount: Math.abs(amount), type, categoryName: category || "אחר", paymentMethodName: payment || null, note: note || null });
  }
  return rows;
}
