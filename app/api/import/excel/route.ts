import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { z } from "zod";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { creditCardIdentityDateRange, creditCardIdentityMatches } from "@/lib/import/credit-card-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 5000;
const GEMINI_TIMEOUT_MS = 20_000;
const GEMINI_RETRIES = 2;
const GEMINI_CHUNK_ROWS = 150;
const GEMINI_MODELS = [process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash", "gemini-2.5-flash-lite"].filter((model, index, models) => model && models.indexOf(model) === index);
const rowSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), amount: z.number().finite().positive().max(999999999), type: z.enum(["INCOME", "EXPENSE"]), categoryName: z.string().trim().min(1).max(60), paymentMethodName: z.string().trim().max(80).nullable().optional(), note: z.string().trim().max(500).nullable().optional() });
const responseSchema = z.object({ rows: z.array(rowSchema).max(GEMINI_CHUNK_ROWS) });
type GeminiRow = z.infer<typeof rowSchema>;
type ImportSource = "BANK" | "CREDIT_CARD";
type ClassifiedKind = "STANDARD" | "TRANSFER" | "CASH_WITHDRAWAL" | "LOAN_PRINCIPAL" | "REFUND";
type ClassifiedRow = GeminiRow & { kind: ClassifiedKind };
type HeaderMap = { date?: number; amount?: number; type?: number; category?: number; paymentMethod?: number; note?: number; description?: number; debit?: number; credit?: number };

type ImportIdentity = { date: string; type: string; note?: string | null; paymentMethodName?: string | null };

function normalizeHeader(value: unknown) { return String(value ?? "").trim().toLocaleLowerCase("he").replace(/[\s_\-./]+/g, " "); }
function findColumn(headers: unknown[], aliases: string[]) { const normalized = headers.map(normalizeHeader); const index = normalized.findIndex((value) => aliases.some((alias) => value === alias || value.includes(alias))); return index >= 0 ? index : undefined; }
function detectHeaders(headers: unknown[]): HeaderMap {
  const aliases = { date: ["date", "transaction date", "תאריך", "תאריך עסקה", "יום"], amount: ["amount", "sum", "סכום", "סכום עסקה", "סכום חיוב"], type: ["type", "transaction type", "סוג", "סוג תנועה", "הכנסה הוצאה"], category: ["category", "קטגוריה", "סיווג"], paymentMethod: ["payment method", "payment", "אמצעי תשלום", "אמצעי", "כרטיס"], note: ["note", "notes", "הערה", "הערות"], description: ["description", "details", "merchant", "תיאור", "פרטים", "בית עסק", "שם בית עסק"], debit: ["debit", "withdrawal", "debit amount", "חיוב", "משיכה"], credit: ["credit", "deposit", "credit amount", "זיכוי", "הפקדה"] };
  return { date: findColumn(headers, aliases.date), amount: findColumn(headers, aliases.amount), type: findColumn(headers, aliases.type), category: findColumn(headers, aliases.category), paymentMethod: findColumn(headers, aliases.paymentMethod), note: findColumn(headers, aliases.note), description: findColumn(headers, aliases.description), debit: findColumn(headers, aliases.debit), credit: findColumn(headers, aliases.credit) };
}
function excelDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") { const d = XLSX.SSF.parse_date_code(value); if (d?.y && d?.m && d?.d) return `${d.y.toString().padStart(4, "0")}-${d.m.toString().padStart(2, "0")}-${d.d.toString().padStart(2, "0")}`; }
  const text = String(value ?? "").trim(); if (!text) return null;
  const m = text.match(/^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})$/); if (!m) return null;
  const [, a, b, c] = m; let y: number, mo: number, day: number;
  if (a.length === 4) [y, mo, day] = [+a, +b, +c]; else if (c.length === 4) [day, mo, y] = [+a, +b, +c]; else return null;
  const d = new Date(Date.UTC(y, mo - 1, day)); return d.getUTCFullYear() === y && d.getUTCMonth() === mo - 1 && d.getUTCDate() === day ? `${y.toString().padStart(4, "0")}-${mo.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}` : null;
}
function numericAmount(value: unknown) { if (typeof value === "number" && Number.isFinite(value)) return value; const text = String(value ?? "").replace(/[,₪$€£\s]/g, "").replace(/\(([^)]+)\)/, "-$1").replace(/[^\d.+-]/g, ""); const amount = Number(text); return Number.isFinite(amount) ? amount : null; }
function inferType(value: unknown, amount: number) { const text = String(value ?? "").trim().toLocaleLowerCase("he"); if (/(income|credit|deposit|הכנסה|זיכוי|הפקדה)/i.test(text)) return "INCOME" as const; if (/(expense|debit|charge|payment|הוצאה|חיוב|תשלום)/i.test(text)) return "EXPENSE" as const; return amount < 0 ? "INCOME" as const : "EXPENSE" as const; }
function localNormalize(rawRows: unknown[][]): GeminiRow[] | null {
  if (rawRows.length < 2) return [];
  const map = detectHeaders(rawRows[0] ?? []); if (map.date === undefined) return null;
  const hasDebitCredit = map.debit !== undefined || map.credit !== undefined;
  if (map.amount === undefined && !hasDebitCredit) return null; if (map.type === undefined && !hasDebitCredit) return null;
  const rows: GeminiRow[] = [];
  for (const raw of rawRows.slice(1)) {
    const date = excelDate(raw[map.date]); if (!date) continue;
    let amountValue: number | null = null; let type: "INCOME" | "EXPENSE";
    if (hasDebitCredit) { const debit = map.debit === undefined ? null : numericAmount(raw[map.debit]); const credit = map.credit === undefined ? null : numericAmount(raw[map.credit]); if (debit !== null && debit !== 0) { amountValue = Math.abs(debit); type = "EXPENSE"; } else if (credit !== null && credit !== 0) { amountValue = Math.abs(credit); type = "INCOME"; } else continue; }
    else { amountValue = numericAmount(raw[map.amount!]); if (amountValue === null || amountValue === 0) continue; type = inferType(raw[map.type!], amountValue); }
    const category = map.category === undefined ? "" : String(raw[map.category] ?? "").trim();
    const description = map.description === undefined ? "" : String(raw[map.description] ?? "").trim();
    const note = map.note === undefined ? description : String(raw[map.note] ?? "").trim();
    const paymentMethod = map.paymentMethod === undefined ? "" : String(raw[map.paymentMethod] ?? "").trim();
    rows.push({ date, amount: Math.abs(amountValue), type, categoryName: category || "אחר", paymentMethodName: paymentMethod || null, note: note || null });
  }
  return rows;
}
function isRefundText(row: GeminiRow) { const text = [row.categoryName, row.note ?? "", row.paymentMethodName ?? ""].join(" ").toLocaleLowerCase("he"); return /(refund|credit|credit card refund|זיכוי|החזר|ביטול עסקה|זיכוי עסקה)/i.test(text); }
function classifyImportedRow(row: GeminiRow, source: ImportSource): ClassifiedRow {
  const text = [row.categoryName, row.note ?? "", row.paymentMethodName ?? ""].join(" ").trim().toLocaleLowerCase("he");
  const contains = (...terms: string[]) => terms.some((term) => text.includes(term));
  if (source === "CREDIT_CARD") return { ...row, categoryName: row.categoryName.trim() || "אחר", kind: isRefundText(row) || row.type === "INCOME" ? "REFUND" : "STANDARD" };
  let categoryName = row.categoryName.trim() || "אחר"; let kind: ClassifiedKind = isRefundText(row) && row.type === "EXPENSE" ? "REFUND" : "STANDARD";
  if (contains("החזר שיק", "שגיאה בהקלדת פרטי חשבון")) return { ...row, categoryName: "תיקונים חשבונאיים", kind: "TRANSFER" };
  if (contains("משיכה מבאנקט", "משיכת מזומן", "משיכה כספית")) return { ...row, categoryName: "משיכת מזומן", kind: "CASH_WITHDRAWAL" };
  if (contains("העברה/", "ב.הופועלים-ביט/", "משיכה לחשבון", "ביט/")) return { ...row, categoryName: "העברות כספיות", kind: "TRANSFER" };
  if (contains("ישראכרט בע", "ישראכרט", "כרטיסי אשראי לי")) return { ...row, categoryName: "חיובי כרטיסי אשראי", kind: "TRANSFER" };
  if (contains("הפקדה לפקדון", "מוביל")) return { ...row, categoryName: "חיסכון ופקדונות", kind: "TRANSFER" };
  if (contains("כלל השתלמויות כלל")) categoryName = "קרן השתלמות";
  else if (contains("מיטב דש גמל", "כלל פנסיה וגמל")) categoryName = "פנסיה וגמל";
  else if (contains("לאומי למשכנתאות")) { categoryName = "דיור והתחייבויות"; kind = "LOAN_PRINCIPAL"; }
  else if (contains("בנק יהב-אשראי", "בנק יהב אשראי", "מימון ישיר")) { categoryName = "חובות והלוואות"; kind = "LOAN_PRINCIPAL"; }
  else if (row.type === "INCOME" && contains("משכורת", "עיריית בית שמש", "ישיבת אוהבי ירו")) categoryName = "שכר עבודה";
  else if (row.type === "INCOME" && contains("מענק עבודה")) categoryName = "מענק עבודה";
  else if (row.type === "INCOME" && contains("קצבת ילדים")) categoryName = "קצבת ילדים";
  else if (row.type === "INCOME" && contains("ריבית זכות")) categoryName = "ריבית זכות";
  else if (contains("עיריית בית שמש")) categoryName = "ארנונה";
  else if (contains("מי שמש בע")) categoryName = "מים";
  else if (contains("סונוג גז פלוס")) categoryName = "גז";
  else if (contains("הראל בטוח", "הראל ביטוח")) categoryName = "ביטוחים";
  else if (contains("מכבי")) categoryName = "בריאות ומכבי";
  else if (contains("ביטוח לאומי")) categoryName = "ביטוח לאומי";
  else if (contains("פאמפי בע")) categoryName = "דלק";
  else if (contains("רשת מרכזים קהילת")) categoryName = "חינוך וקהילה";
  else if (contains("עזר מציון", "ארגון נשי חרות")) categoryName = "תרומות וארגונים";
  else if (contains("עמלות תקופתיות", "דמי ניהול חשבון", "עמלות עו")) categoryName = "עמלות בנק";
  else if (contains("קיזוז מטח", "עמלות מטח", "המרת מטבע")) categoryName = "עמלות והמרת מטבע";
  else if (contains("מס בגין ריבית זכות")) categoryName = "מיסים פיננסיים";
  else if (contains("ריבית")) categoryName = row.type === "INCOME" ? "ריבית זכות" : "ריבית והוצאות מימון";
  return { ...row, categoryName, kind };
}

const SENSITIVE_HEADER = /(card|credit card|cvv|cvc|security code|password|passwd|token|secret|api key|access key|account number|bank account|מספר כרטיס|כרטיס אשראי|קוד אבטחה|סיסמה|סיסמא|טוקן|מפתח|חשבון בנק)/i;
function redactForGemini(rows: unknown[][]) { if (!rows.length) return rows; const headers = rows[0] ?? []; const sensitive = new Set(headers.map((header, index) => SENSITIVE_HEADER.test(normalizeHeader(header)) ? index : -1).filter((index) => index >= 0)); if (!sensitive.size) return rows; return rows.map((row, rowIndex) => rowIndex === 0 ? row : row.map((value, index) => sensitive.has(index) ? "[REDACTED]" : value)); }
function sourceFileHash(source: ImportSource, buffer: Buffer) { return createHash("sha256").update(`${source}:`).update(buffer).digest("hex"); }
function fingerprint(row: ClassifiedRow) { return createHash("sha256").update(JSON.stringify({ source: "BANK", date: row.date, type: row.type, amount: row.amount.toFixed(2), category: row.categoryName.trim().toLocaleLowerCase("he"), note: row.note?.trim().toLocaleLowerCase("he") || "", payment: row.paymentMethodName?.trim().toLocaleLowerCase("he") || "" })).digest("hex"); }
function creditCardType(row: GeminiRow) { return isRefundText(row) || row.type === "INCOME" ? "REFUND" as const : "CHARGE" as const; }
function creditCardFingerprint(row: GeminiRow) { return createHash("sha256").update(JSON.stringify({ source: "CREDIT_CARD", date: row.date, type: creditCardType(row), amount: row.amount.toFixed(2), merchant: (row.note || row.categoryName).trim().toLocaleLowerCase("he"), payment: row.paymentMethodName?.trim().toLocaleLowerCase("he") || "" })).digest("hex"); }
function identityKey(value: ImportIdentity) { return JSON.stringify({ date: value.date, type: value.type, note: value.note?.trim().toLocaleLowerCase("he") || "", paymentMethodName: value.paymentMethodName?.trim().toLocaleLowerCase("he") || "" }); }
function legacyKey(value: ImportIdentity & { amount: number }) { return JSON.stringify({ ...JSON.parse(identityKey(value)), amount: Number(value.amount).toFixed(2) }); }

async function readBody(file: File) { if (!file.name.toLowerCase().endsWith(".xlsx") && !file.name.toLowerCase().endsWith(".xls") && !file.name.toLowerCase().endsWith(".csv")) throw new Error("UNSUPPORTED_FILE"); if (file.size > MAX_BYTES) throw new Error("FILE_TOO_LARGE"); const buffer = Buffer.from(await file.arrayBuffer()); if (!buffer.length) throw new Error("EMPTY_FILE"); return buffer; }

async function parseGemini(rows: unknown[][]) { const apiKey = process.env.GEMINI_API_KEY?.trim(); if (!apiKey) throw new Error("GEMINI_NOT_CONFIGURED"); const payload = rows.slice(0, MAX_ROWS); const prompt = `Normalize these spreadsheet rows into JSON with exactly this schema: {"rows":[{"date":"YYYY-MM-DD","amount":number,"type":"INCOME|EXPENSE","categoryName":string,"paymentMethodName":string|null,"note":string|null}]}. Preserve transaction meaning. Do not invent missing values.\n${JSON.stringify(payload)}`; for (const model of GEMINI_MODELS) { for (let attempt = 0; attempt <= GEMINI_RETRIES; attempt++) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS); try { const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: "application/json" } }), signal: controller.signal }); clearTimeout(timer); if (response.status === 429) { if (attempt < GEMINI_RETRIES) { await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1))); continue; } continue; } if (!response.ok) { if (response.status === 401 || response.status === 403) throw new Error("GEMINI_AUTH_FAILED"); if (attempt < GEMINI_RETRIES) continue; continue; } const json = await response.json(); const text = json?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("").trim(); if (!text) continue; try { return responseSchema.parse(JSON.parse(text)).rows; } catch { if (attempt === GEMINI_RETRIES) throw new Error("GEMINI_INVALID_RESPONSE"); } } } throw new Error("GEMINI_EMPTY_RESPONSE"); }

export async function POST(request: Request) {
  let importId: string | null = null; let userId: string | null = null;
  try {
    const user = await requireUser(request); userId = user.id;
    const formData = await request.formData(); const file = formData.get("file"); const source = String(formData.get("source") || "BANK") as ImportSource; if (!(file instanceof File)) throw new Error("EMPTY_FILE"); if (source !== "BANK" && source !== "CREDIT_CARD") throw new Error("INVALID_SOURCE");
    const buffer = await readBody(file); const fileHash = sourceFileHash(source, buffer);
    const prior = await prisma.importJob.findFirst({ where: { userId: user.id, fileHash, status: "COMPLETED" }, select: { id: true } }); if (prior) return NextResponse.json({ success: true, alreadyProcessed: true, importId: prior.id, fileName: file.name, source, rowsImported: 0, rowsUpdated: 0, rowsSkipped: 0 });
    const processing = await prisma.importJob.findFirst({ where: { userId: user.id, fileHash, status: "PROCESSING" }, select: { id: true } }); if (processing) return NextResponse.json({ error: "הקובץ כבר נמצא בתהליך ייבוא" }, { status: 409 });
    const importJob = await prisma.importJob.create({ data: { userId: user.id, fileName: file.name, fileHash, source, status: "PROCESSING" } }); importId = importJob.id;
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: true }); const rowsBySheet = workbook.SheetNames.flatMap((sheetName) => { const sheet = workbook.Sheets[sheetName]; return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true }).slice(0, MAX_ROWS); }); const importedRows = localNormalize(rowsBySheet) ?? await parseGemini(redactForGemini(rowsBySheet)); const detectedRows = importedRows.length; const classifiedRows = importedRows.map((row) => classifyImportedRow(row, source)); const uniqueRows = Array.from(new Map(classifiedRows.map((row) => [(source === "BANK" ? fingerprint(row) : creditCardFingerprint(row)), row])).values());
    await prisma.importJob.update({ where: { id: importId }, data: { rowsAnalyzed: importedRows.length, rowsSkipped: Math.max(0, importedRows.length - uniqueRows.length) } }); if (!uniqueRows.length) throw new Error("NO_VALID_ROWS");

    if (source === "CREDIT_CARD") {
      const fingerprints = uniqueRows.map(creditCardFingerprint); const existing = await prisma.creditCardTransaction.findMany({ where: { userId: user.id, fingerprint: { in: fingerprints } }, select: { id: true, fingerprint: true } }); const existingByFingerprint = new Map(existing.map((row) => [row.fingerprint, row.id]));
      const dates = uniqueRows.map((row) => row.date).sort(); const minDate = new Date(`${dates[0]}T00:00:00.000Z`); const maxDate = new Date(`${dates[dates.length - 1]}T23:59:59.999Z`);
      const candidates = await prisma.creditCardTransaction.findMany({ where: { userId: user.id, purchaseDate: { gte: minDate, lte: maxDate } }, select: { id: true, purchaseDate: true, amount: true, type: true, merchant: true, note: true, installmentNumber: true, installmentTotal: true, paymentMethodId: true } });
      const categories = await prisma.category.findMany({ where: { userId: user.id } }); const categoryMap = new Map(categories.map((category) => [`${category.type}:${category.name.trim().toLocaleLowerCase("he")}`, category])); const methods = await prisma.paymentMethod.findMany({ where: { userId: user.id } }); const methodMap = new Map(methods.map((method) => [method.nickname.trim().toLocaleLowerCase("he"), method]));
      let createdCategories = 0; let createdPaymentMethods = 0; let updatedRows = 0; let createdRows = 0;
      await prisma.$transaction(async (tx) => {
        for (const row of uniqueRows) {
          const categoryName = row.categoryName.trim() || "אחר"; const categoryKey = `EXPENSE:${categoryName.toLocaleLowerCase("he")}`; let category = categoryMap.get(categoryKey); if (!category) { category = await tx.category.create({ data: { userId: user.id, name: categoryName, type: "EXPENSE" } }); categoryMap.set(categoryKey, category); createdCategories++; }
          let paymentMethodId: string | null = null; const methodName = row.paymentMethodName?.trim(); if (methodName) { const key = methodName.toLocaleLowerCase("he"); let method = methodMap.get(key); if (!method) { method = await tx.paymentMethod.create({ data: { userId: user.id, nickname: methodName, type: "CARD" } }); methodMap.set(key, method); createdPaymentMethods++; } paymentMethodId = method.id; }
          const merchant = row.note?.trim() || row.categoryName.trim() || "עסקת אשראי"; const type = creditCardType(row); const kind = type === "REFUND" ? "REFUND" as const : "PURCHASE" as const; const fp = creditCardFingerprint(row); const data = { type, kind, amount: row.amount, purchaseDate: new Date(`${row.date}T00:00:00.000Z`), postingDate: new Date(`${row.date}T00:00:00.000Z`), merchant, categoryId: category.id, paymentMethodId, note: row.note?.trim() || null, fingerprint: fp };
          const identityMatches = candidates.filter((candidate) => creditCardIdentityMatches({ date: row.date, type, amount: row.amount, merchant, note: row.note?.trim() || null, installmentNumber: null, installmentTotal: null, paymentMethodId }, candidate));
          const identityMatch = identityMatches.length === 1 ? identityMatches[0] : null;
          const existingId = existingByFingerprint.get(fp) ?? identityMatch?.id;
          if (existingId) { await tx.creditCardTransaction.update({ where: { id: existingId }, data }); updatedRows++; } else { await tx.creditCardTransaction.create({ data: { ...data, userId: user.id } }); createdRows++; }
        }
      });
      await prisma.importJob.update({ where: { id: importId }, data: { status: "COMPLETED", rowsImported: createdRows, rowsUpdated: updatedRows, rowsSkipped: Math.max(0, detectedRows - createdRows - updatedRows), categoriesCreated: createdCategories, paymentMethodsCreated: createdPaymentMethods, completedAt: new Date() } });
      return NextResponse.json({ success: true, importId, fileName: file.name, source, analysisMode: "local", rowsDetected: detectedRows, rowsAnalyzed: importedRows.length, rowsImported: createdRows, rowsUpdated: updatedRows, rowsSkipped: Math.max(0, detectedRows - createdRows - updatedRows), categoriesCreated: createdCategories, paymentMethodsCreated: createdPaymentMethods });
    }

    const fingerprints = uniqueRows.map(fingerprint); const existing = await prisma.transaction.findMany({ where: { userId: user.id, fingerprint: { in: fingerprints } }, select: { id: true, fingerprint: true } }); const existingByFingerprint = new Map(existing.filter((row): row is { id: string; fingerprint: string } => Boolean(row.fingerprint)).map((row) => [row.fingerprint, row.id]));
    const minDate = new Date(`${uniqueRows.reduce((min, row) => row.date < min ? row.date : min, uniqueRows[0].date)}T00:00:00.000Z`); const maxDate = new Date(`${uniqueRows.reduce((max, row) => row.date > max ? row.date : max, uniqueRows[0].date)}T23:59:59.999Z`);
    const legacyTransactions = await prisma.transaction.findMany({ where: { userId: user.id, fingerprint: null, transactionDate: { gte: minDate, lte: maxDate } }, select: { id: true, transactionDate: true, amount: true, type: true, note: true, paymentMethod: { select: { nickname: true } }, createdAt: true }, orderBy: { createdAt: "asc" } }); const legacyByKey = new Map<string, string[]>(); for (const transaction of legacyTransactions) { const key = legacyKey({ date: transaction.transactionDate.toISOString().slice(0, 10), amount: Number(transaction.amount), type: transaction.type, note: transaction.note, paymentMethodName: transaction.paymentMethod?.nickname ?? null }); const ids = legacyByKey.get(key) ?? []; ids.push(transaction.id); legacyByKey.set(key, ids); }
    const candidates = await prisma.transaction.findMany({ where: { userId: user.id, transactionDate: { gte: minDate, lte: maxDate } }, select: { id: true, transactionDate: true, amount: true, type: true, note: true, fingerprint: true, paymentMethod: { select: { nickname: true } } }, orderBy: { createdAt: "asc" } }); const reimportByKey = new Map<string, string[]>(); for (const transaction of candidates) { const key = identityKey({ date: transaction.transactionDate.toISOString().slice(0, 10), type: transaction.type, note: transaction.note, paymentMethodName: transaction.paymentMethod?.nickname ?? null }); const ids = reimportByKey.get(key) ?? []; ids.push(transaction.id); reimportByKey.set(key, ids); }
    const legacyMatches = new Map<string, string>(); const reimportMatches = new Map<string, string>(); const claimedExistingIds = new Set<string>(existingByFingerprint.values());
    for (const row of uniqueRows) { const fp = fingerprint(row); if (existingByFingerprint.has(fp)) continue; const identityCandidates = (reimportByKey.get(identityKey(row)) ?? []).filter((id) => !claimedExistingIds.has(id)); if (identityCandidates.length === 1) { reimportMatches.set(fp, identityCandidates[0]); claimedExistingIds.add(identityCandidates[0]); continue; } const candidatesForLegacy = (legacyByKey.get(legacyKey({ ...row, amount: row.amount })) ?? []).filter((id) => !claimedExistingIds.has(id)); const legacyId = candidatesForLegacy.length === 1 ? candidatesForLegacy[0] : undefined; if (legacyId) { legacyMatches.set(fp, legacyId); claimedExistingIds.add(legacyId); } }
    const rowsToCreate = uniqueRows.filter((row) => !existingByFingerprint.has(fingerprint(row)) && !reimportMatches.has(fingerprint(row)) && !legacyMatches.has(fingerprint(row))); const categories = await prisma.category.findMany({ where: { userId: user.id } }); const categoryMap = new Map(categories.map((category) => [`${category.type}:${category.name.trim().toLocaleLowerCase("he")}`, category])); const methods = await prisma.paymentMethod.findMany({ where: { userId: user.id } }); const methodMap = new Map(methods.map((method) => [method.nickname.trim().toLocaleLowerCase("he"), method])); let createdCategories = 0; let createdPaymentMethods = 0; let updatedRows = 0;
    await prisma.$transaction(async (tx) => { for (const row of uniqueRows) { const categoryKey = `${row.type}:${row.categoryName.trim().toLocaleLowerCase("he")}`; let category = categoryMap.get(categoryKey); if (!category) { category = await tx.category.create({ data: { userId: user.id, name: row.categoryName.trim(), type: row.type } }); categoryMap.set(categoryKey, category); createdCategories++; } let paymentMethodId: string | null = null; const methodName = row.paymentMethodName?.trim(); if (methodName) { const key = methodName.toLocaleLowerCase("he"); let method = methodMap.get(key); if (!method) { method = await tx.paymentMethod.create({ data: { userId: user.id, nickname: methodName, type: "OTHER" } }); methodMap.set(key, method); createdPaymentMethods++; } paymentMethodId = method.id; } const fp = fingerprint(row); const data = { type: row.type, kind: row.kind, amount: row.amount, transactionDate: new Date(`${row.date}T00:00:00.000Z`), categoryId: category.id, paymentMethodId, note: row.note?.trim() || null, fingerprint: fp }; const existingId = existingByFingerprint.get(fp) ?? reimportMatches.get(fp) ?? legacyMatches.get(fp); if (existingId) { await tx.transaction.update({ where: { id: existingId }, data }); updatedRows++; } else { await tx.transaction.create({ data: { ...data, userId: user.id } }); } } });
    const createdRows = rowsToCreate.length; await prisma.importJob.update({ where: { id: importId }, data: { status: "COMPLETED", rowsImported: createdRows, rowsUpdated: updatedRows, rowsSkipped: Math.max(0, detectedRows - createdRows - updatedRows), categoriesCreated: createdCategories, paymentMethodsCreated: createdPaymentMethods, completedAt: new Date() } });
    return NextResponse.json({ success: true, importId, fileName: file.name, source, analysisMode: "local", rowsDetected: detectedRows, rowsAnalyzed: importedRows.length, rowsImported: createdRows, rowsUpdated: updatedRows, rowsSkipped: Math.max(0, detectedRows - createdRows - updatedRows), categoriesCreated: createdCategories, paymentMethodsCreated: createdPaymentMethods });
  } catch (error) {
    if (importId && userId) await prisma.importJob.update({ where: { id: importId }, data: { status: "FAILED", errorMessage: error instanceof Error ? error.message.slice(0, 500) : "IMPORT_FAILED" } }).catch(() => undefined);
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    const messages: Record<string, [string, number]> = { GEMINI_NOT_CONFIGURED: ["שירות Gemini לא מוגדר בשרת. יש להגדיר GEMINI_API_KEY.", 503], GEMINI_AUTH_FAILED: ["מפתח Gemini אינו תקין או אינו מורשה", 502], GEMINI_RATE_LIMITED: ["שירות Gemini הגיע למגבלת הבקשות. המערכת ניסתה שוב אוטומטית.", 429], GEMINI_TIMEOUT: ["Gemini לא הגיב בזמן. המערכת ניסתה שוב אוטומטית ובמודל חלופי.", 504], GEMINI_NETWORK_ERROR: ["החיבור לשירות Gemini נכשל. המערכת ניסתה שוב אוטומטית.", 502], GEMINI_EMPTY_RESPONSE: ["Gemini לא החזיר נתונים לייבוא", 502], GEMINI_INVALID_RESPONSE: ["Gemini החזיר תשובה שלא ניתן לעבד", 502], EMPTY_SPREADSHEET: ["לא נמצאו נתונים בקובץ", 400], NO_VALID_ROWS: ["לא נמצאו תנועות תקינות לייבוא", 422], UNSUPPORTED_FILE: ["סוג הקובץ אינו נתמך", 400], FILE_TOO_LARGE: ["הקובץ גדול מדי", 413], EMPTY_FILE: ["הקובץ ריק", 400], INVALID_SOURCE: ["מקור הייבוא אינו תקין", 400] };
    if (error instanceof Error && messages[error.message]) { const [message, status] = messages[error.message]; return NextResponse.json({ error: message }, { status }); }
    if (error instanceof Error && error.message.includes("Unique constraint")) return NextResponse.json({ error: "קיימת כבר תנועה זהה או פעולה מתנגשת. לא נוצרו כפילויות." }, { status: 409 });
    console.error("Excel import failed", error); return NextResponse.json({ error: "לא ניתן לייבא את קובץ Excel" }, { status: 400 });
  }
}
