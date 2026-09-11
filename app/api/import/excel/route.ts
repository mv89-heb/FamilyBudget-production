import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 2000;
const GEMINI_TIMEOUT_MS = 60_000;
const rowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().finite().positive().max(999999999),
  type: z.enum(["INCOME", "EXPENSE"]),
  categoryName: z.string().trim().min(1).max(60),
  paymentMethodName: z.string().trim().max(80).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
const responseSchema = z.object({ rows: z.array(rowSchema).max(MAX_ROWS) });

function cleanJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return (fenced?.[1] ?? text).trim();
}

async function analyzeWithGemini(rows: unknown[][]) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_NOT_CONFIGURED");

  const payload = {
    contents: [{ parts: [{ text: [
      "You normalize spreadsheet financial transactions for a family budget application.",
      "Return JSON only with this exact shape: {\"rows\":[{\"date\":\"YYYY-MM-DD\",\"amount\":number,\"type\":\"INCOME\"|\"EXPENSE\",\"categoryName\":string,\"paymentMethodName\":string|null,\"note\":string|null}]}.",
      "Infer column meanings from Hebrew or English headers and row values. Convert expenses/income to positive amounts and set type accordingly.",
      "Do not invent transactions. Ignore totals, headers, blank rows, and summaries. Preserve the transaction date when unambiguous.",
      "Use concise Hebrew category names when a category is obvious; otherwise use 'אחר'. Never include card numbers, CVV, passwords, or other secrets.",
      "Spreadsheet data:", JSON.stringify(rows.slice(0, MAX_ROWS)),
    ].join("\n") }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
        cache: "no-store",
      },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("GEMINI_TIMEOUT");
    throw new Error("GEMINI_NETWORK_ERROR");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    console.error("Gemini request failed", { status: response.status, details: details.slice(0, 1000) });
    if (response.status === 401 || response.status === 403) throw new Error("GEMINI_AUTH_FAILED");
    if (response.status === 429) throw new Error("GEMINI_RATE_LIMITED");
    throw new Error("GEMINI_REQUEST_FAILED");
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") throw new Error("GEMINI_EMPTY_RESPONSE");

  try {
    return responseSchema.parse(JSON.parse(cleanJson(text))).rows;
  } catch {
    throw new Error("GEMINI_INVALID_RESPONSE");
  }
}

export async function POST(req: Request) {
  let userId: string | undefined;
  let importId: string | undefined;
  try {
    const user = await requireUser();
    const authenticatedUserId = user.id;
    userId = authenticatedUserId;
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "יש להעלות קובץ Excel" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "הקובץ גדול מדי (מקסימום 5MB)" }, { status: 413 });
    if (!/\.(xlsx|xls)$/i.test(file.name)) return NextResponse.json({ error: "נתמך רק קובץ XLSX או XLS" }, { status: 415 });

    const job = await prisma.importJob.create({ data: { userId: authenticatedUserId, fileName: file.name, status: "PROCESSING" } });
    importId = job.id;

    const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer", cellDates: true, raw: true });
    const rawRows: unknown[][] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
      for (const row of rows) {
        if (Array.isArray(row) && row.some(v => v !== null && String(v).trim() !== "")) rawRows.push(row);
        if (rawRows.length >= MAX_ROWS + 1) break;
      }
      if (rawRows.length >= MAX_ROWS + 1) break;
    }
    if (rawRows.length < 2) throw new Error("EMPTY_SPREADSHEET");
    await prisma.importJob.update({ where: { id: importId }, data: { rowsDetected: rawRows.length - 1 } });

    const importedRows = await analyzeWithGemini(rawRows);
    const validRows = importedRows.filter((row) => {
      const date = new Date(`${row.date}T00:00:00.000Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === row.date;
    });
    await prisma.importJob.update({ where: { id: importId }, data: { rowsAnalyzed: importedRows.length, rowsSkipped: importedRows.length - validRows.length } });
    if (!validRows.length) throw new Error("NO_VALID_ROWS");

    const categories = await prisma.category.findMany({ where: { userId: authenticatedUserId } });
    const categoryMap = new Map(categories.map(c => [`${c.type}:${c.name.trim().toLocaleLowerCase("he")}`, c]));
    const methods = await prisma.paymentMethod.findMany({ where: { userId: authenticatedUserId } });
    const methodMap = new Map(methods.map(m => [m.nickname.trim().toLocaleLowerCase("he"), m]));
    let createdCategories = 0;
    let createdPaymentMethods = 0;

    const created = await prisma.$transaction(async (tx) => {
      const data: Array<{ userId: string; type: "INCOME" | "EXPENSE"; amount: number; transactionDate: Date; categoryId: string; paymentMethodId: string | null; note: string | null }> = [];
      for (const row of validRows) {
        const categoryKey = `${row.type}:${row.categoryName.trim().toLocaleLowerCase("he")}`;
        let category = categoryMap.get(categoryKey);
        if (!category) {
          category = await tx.category.create({ data: { userId: authenticatedUserId, name: row.categoryName.trim(), type: row.type } });
          categoryMap.set(categoryKey, category); createdCategories++;
        }
        let paymentMethodId: string | null = null;
        const methodName = row.paymentMethodName?.trim();
        if (methodName) {
          const key = methodName.toLocaleLowerCase("he");
          let method = methodMap.get(key);
          if (!method) {
            method = await tx.paymentMethod.create({ data: { userId: authenticatedUserId, nickname: methodName, type: "OTHER" } });
            methodMap.set(key, method); createdPaymentMethods++;
          }
          paymentMethodId = method.id;
        }
        data.push({ userId: authenticatedUserId, type: row.type, amount: row.amount, transactionDate: new Date(`${row.date}T00:00:00.000Z`), categoryId: category.id, paymentMethodId, note: row.note?.trim() || null });
      }
      const result = await tx.transaction.createMany({ data });
      return result.count;
    });

    await prisma.importJob.update({ where: { id: importId }, data: { status: "COMPLETED", rowsImported: created, categoriesCreated: createdCategories, paymentMethodsCreated: createdPaymentMethods, completedAt: new Date() } });
    return NextResponse.json({ success: true, importId, fileName: file.name, rowsDetected: rawRows.length - 1, rowsAnalyzed: importedRows.length, rowsImported: created, rowsSkipped: importedRows.length - validRows.length, categoriesCreated: createdCategories, paymentMethodsCreated: createdPaymentMethods });
  } catch (error) {
    if (importId && userId) {
      await prisma.importJob.update({ where: { id: importId }, data: { status: "FAILED", errorMessage: error instanceof Error ? error.message.slice(0, 500) : "IMPORT_FAILED" } }).catch(() => undefined);
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    if (error instanceof Error && error.message === "GEMINI_NOT_CONFIGURED") return NextResponse.json({ error: "שירות Gemini לא מוגדר בשרת" }, { status: 503 });
    if (error instanceof Error && error.message === "GEMINI_AUTH_FAILED") return NextResponse.json({ error: "מפתח Gemini אינו תקין או אינו מורשה" }, { status: 502 });
    if (error instanceof Error && error.message === "GEMINI_RATE_LIMITED") return NextResponse.json({ error: "שירות Gemini הגיע למגבלת הבקשות. נסה שוב בעוד מעט" }, { status: 429 });
    if (error instanceof Error && error.message === "GEMINI_TIMEOUT") return NextResponse.json({ error: "Gemini לא הגיב בזמן. נסה שוב עם קובץ קטן יותר" }, { status: 504 });
    if (error instanceof Error && error.message === "GEMINI_NETWORK_ERROR") return NextResponse.json({ error: "לא ניתן להתחבר לשירות Gemini" }, { status: 502 });
    if (error instanceof Error && error.message === "GEMINI_INVALID_RESPONSE") return NextResponse.json({ error: "Gemini החזיר תשובה שלא ניתן לעבד" }, { status: 502 });
    if (error instanceof Error && error.message === "EMPTY_SPREADSHEET") return NextResponse.json({ error: "לא נמצאו נתונים בקובץ" }, { status: 400 });
    if (error instanceof Error && error.message === "NO_VALID_ROWS") return NextResponse.json({ error: "Gemini לא הצליח לזהות תנועות תקינות" }, { status: 422 });
    console.error("Excel import failed", error);
    return NextResponse.json({ error: "לא ניתן לייבא את קובץ Excel" }, { status: 400 });
  }
}
