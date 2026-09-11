import * as XLSX from "xlsx";
import { createHash } from "node:crypto";
import { PDFParse } from "pdf-parse";

export const MAX_CREDIT_CARD_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_CREDIT_CARD_ROWS = 10000;

export type ParsedCreditCardRow = {
  date: string;
  postingDate: string | null;
  amount: number;
  type: "CHARGE" | "REFUND";
  kind: "PURCHASE" | "INSTALLMENT" | "REFUND" | "FEE" | "OTHER";
  merchant: string;
  note: string | null;
  reference: string | null;
  installmentTotal: number | null;
  installmentNumber: number | null;
  categoryName: string;
};

type HeaderMap = { date?: number; postingDate?: number; amount?: number; debit?: number; credit?: number; merchant?: number; note?: number; reference?: number; type?: number; installments?: number };

const normalize = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("he").replace(/[\s_\-./]+/g, " ");
const aliases = {
  date: ["date", "transaction date", "purchase date", "תאריך", "תאריך עסקה", "תאריך רכישה"],
  postingDate: ["posting date", "value date", "תאריך חיוב", "תאריך קליטה", "מועד חיוב"],
  amount: ["amount", "sum", "charge amount", "סכום", "סכום עסקה", "סכום חיוב"],
  debit: ["debit", "חיוב", "סכום לחיוב", "חובה"],
  credit: ["credit", "refund", "זיכוי", "החזר", "זכות"],
  merchant: ["merchant", "description", "details", "בית עסק", "שם בית עסק", "תיאור", "פרטים"],
  note: ["note", "notes", "הערה", "הערות"],
  reference: ["reference", "ref", "מספר עסקה", "אסמכתא", "מס אסמכתא"],
  type: ["type", "transaction type", "סוג", "סוג עסקה"],
  installments: ["installment", "installments", "תשלום", "תשלומים"],
};

function find(headers: unknown[], values: string[]) {
  const normalized = headers.map(normalize);
  const index = normalized.findIndex((header) => values.some((alias) => header === alias || header.includes(alias)));
  return index >= 0 ? index : undefined;
}

function detectHeaders(headers: unknown[]): HeaderMap {
  return {
    date: find(headers, aliases.date), postingDate: find(headers, aliases.postingDate), amount: find(headers, aliases.amount),
    debit: find(headers, aliases.debit), credit: find(headers, aliases.credit), merchant: find(headers, aliases.merchant),
    note: find(headers, aliases.note), reference: find(headers, aliases.reference), type: find(headers, aliases.type), installments: find(headers, aliases.installments),
  };
}

function excelDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) return `${parsed.y}`.padStart(4, "0") + `-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})$/);
  if (!match) return null;
  const [, a, b, c] = match;
  let year: number, month: number, day: number;
  if (a.length === 4) [year, month, day] = [+a, +b, +c]; else if (c.length === 4) [day, month, year] = [+a, +b, +c]; else return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null;
}

function amount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "").replace(/[,₪$€£\s]/g, "").replace(/\(([^)]+)\)/, "-$1").replace(/[^\d.+-]/g, "");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function installment(value: unknown) {
  const text = String(value ?? "").trim();
  const match = text.match(/(\d{1,2})\s*[\/מ-]\s*(\d{1,2})|(?:תשלום|payment)\s*(\d{1,2})\s*(?:מתוך|of|\/)\s*(\d{1,2})/i);
  if (!match) return { number: null, total: null };
  const number = Number(match[1] ?? match[3]); const total = Number(match[2] ?? match[4]);
  return Number.isInteger(number) && Number.isInteger(total) ? { number, total } : { number: null, total: null };
}

function classify(merchant: string, note: string | null, type: "CHARGE" | "REFUND") {
  const text = `${merchant} ${note ?? ""}`.toLocaleLowerCase("he");
  if (type === "REFUND") return "החזרים";
  if (/(סופר|רמי לוי|שופרסל|ויקטורי|יוחננוף|מכולת|מרקט|מזון|סופר פארם)/i.test(text)) return "סופר ומזון";
  if (/(דלק|פז |סונול|דור אלון|טן |fuel|gas station)/i.test(text)) return "דלק";
  if (/(חשמל|מים|גז|ארנונה|ועד בית|שכירות|משכנת)/i.test(text)) return "דיור והתחייבויות";
  if (/(מכבי|כללית|מאוחדת|רופא|בית מרקחת|pharmacy)/i.test(text)) return "בריאות";
  if (/(גן|בית ספר|לימוד|חינוך|צהרון|קייטנה)/i.test(text)) return "חינוך וילדים";
  if (/(מסעד|פיצה|בורגר|קפה|קפ|אוכל|וולט|wolt)/i.test(text)) return "בילויים ואוכל בחוץ";
  if (/(ביטוח|הראל|כלל|מגדל|מנורה|פניקס)/i.test(text)) return "ביטוחים";
  if (/(בגד|אופנה|נעל|שופינג|איקאה|זר פור יו)/i.test(text)) return "קניות";
  if (/(טלפון|סלקום|פרטנר|פלאפון|internet|אינטרנט)/i.test(text)) return "תקשורת";
  if (/(עמלה|דמי כרטיס|ריבית)/i.test(text)) return "עמלות ומימון";
  return "אחר";
}

export async function parseExcel(buffer: Buffer): Promise<ParsedCreditCardRow[]> {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: true });
  const rows: ParsedCreditCardRow[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
    if (raw.length < 2) continue;
    const map = detectHeaders(raw[0] ?? []);
    if (map.date === undefined || (map.amount === undefined && map.debit === undefined && map.credit === undefined)) continue;
    for (const row of raw.slice(1)) {
      if (rows.length >= MAX_CREDIT_CARD_ROWS) break;
      const date = excelDate(row[map.date]);
      if (!date) continue;
      const debit = map.debit === undefined ? null : amount(row[map.debit]);
      const credit = map.credit === undefined ? null : amount(row[map.credit]);
      let numeric = map.amount === undefined ? null : amount(row[map.amount]);
      let type: "CHARGE" | "REFUND";
      if (debit !== null && debit !== 0) { numeric = Math.abs(debit); type = "CHARGE"; }
      else if (credit !== null && credit !== 0) { numeric = Math.abs(credit); type = "REFUND"; }
      else { if (numeric === null || numeric === 0) continue; type = numeric < 0 ? "REFUND" : (String(row[map.type ?? -1] ?? "").match(/refund|זיכוי|החזר/i) ? "REFUND" : "CHARGE"); numeric = Math.abs(numeric); }
      const merchant = String(row[map.merchant ?? -1] ?? "").trim();
      if (!merchant) continue;
      const note = map.note === undefined ? null : String(row[map.note] ?? "").trim() || null;
      const parsedInstallment = installment(map.installments === undefined ? note : row[map.installments]);
      rows.push({ date, postingDate: map.postingDate === undefined ? null : excelDate(row[map.postingDate]), amount: numeric, type, kind: type === "REFUND" ? "REFUND" : parsedInstallment.number ? "INSTALLMENT" : "PURCHASE", merchant, note, reference: map.reference === undefined ? null : String(row[map.reference] ?? "").trim() || null, installmentTotal: parsedInstallment.total, installmentNumber: parsedInstallment.number, categoryName: classify(merchant, note, type) });
    }
    if (rows.length >= MAX_CREDIT_CARD_ROWS) break;
  }
  return rows;
}

export async function parsePdf(buffer: Buffer): Promise<ParsedCreditCardRow[]> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const lines = result.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const rows: ParsedCreditCardRow[] = [];
    for (const line of lines) {
      if (rows.length >= MAX_CREDIT_CARD_ROWS) break;
      const dateMatch = line.match(/(^|\s)(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})(?=\s|$)/);
      const moneyMatch = line.match(/(?:^|\s)([-+]?\(?\d{1,3}(?:[,\d]*)(?:\.\d{2})?\)?)(?:\s|$)/g);
      if (!dateMatch || !moneyMatch) continue;
      const rawMoney = moneyMatch[moneyMatch.length - 1]?.trim() ?? "";
      const numeric = amount(rawMoney);
      if (numeric === null || numeric === 0) continue;
      const date = excelDate(dateMatch[2]);
      if (!date) continue;
      const before = line.replace(dateMatch[0], " ").replace(rawMoney, " ").replace(/\s+/g, " ").trim();
      if (!before || /תאריך|date|סכום|amount|בית עסק|merchant/i.test(before) || before.length > 180) continue;
      const type = /(^|\s)(זיכוי|החזר|refund)(\s|$)/i.test(line) || numeric < 0 ? "REFUND" : "CHARGE";
      const merchant = before.replace(/\b(חיוב|תשלום|עסקה|refund|זיכוי)\b/gi, "").trim();
      if (!merchant) continue;
      const parsedInstallment = installment(line);
      rows.push({ date, postingDate: null, amount: Math.abs(numeric), type, kind: type === "REFUND" ? "REFUND" : parsedInstallment.number ? "INSTALLMENT" : /עמלה/i.test(line) ? "FEE" : "PURCHASE", merchant, note: null, reference: null, installmentTotal: parsedInstallment.total, installmentNumber: parsedInstallment.number, categoryName: classify(merchant, null, type) });
    }
    return rows;
  } finally {
    await parser.destroy();
  }
}

export function fingerprint(row: ParsedCreditCardRow, paymentMethodId: string | null) {
  const raw = [row.date, row.postingDate ?? "", row.type, row.amount.toFixed(2), row.merchant.toLocaleLowerCase("he"), row.reference ?? "", row.installmentNumber ?? "", row.installmentTotal ?? "", paymentMethodId ?? ""].join("|");
  return createHash("sha256").update(raw, "utf8").digest("hex");
}
