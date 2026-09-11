import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { transactionSchema, monthSchema } from "@/lib/validation";
import { TransactionType, TransactionKind } from "@prisma/client";

function monthRange(month: string) {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}
const transactionInclude = { category: { select: { id: true, name: true, type: true } }, paymentMethod: { select: { id: true, nickname: true, last4: true, type: true } }, loan: { select: { id: true, name: true } } } as const;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 100;
function pagination(searchParams: URLSearchParams) {
  const rawPage = Number.parseInt(searchParams.get("page") || "1", 10); const rawLimit = Number.parseInt(searchParams.get("limit") || String(DEFAULT_PAGE_SIZE), 10);
  const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1; const limit = Number.isFinite(rawLimit) ? Math.min(MAX_PAGE_SIZE, Math.max(1, rawLimit)) : DEFAULT_PAGE_SIZE;
  return { page, limit, skip: (page - 1) * limit };
}

export async function GET(req: Request) {
  try {
    const user = await requireUser(); const searchParams = new URL(req.url).searchParams; const monthParam = searchParams.get("month"); const month = monthParam || new Date().toISOString().slice(0, 7); const { page, limit, skip } = pagination(searchParams);
    const where = month === "all" ? { userId: user.id } : (() => { const validMonth = monthSchema.parse(month); const { start, end } = monthRange(validMonth); return { userId: user.id, transactionDate: { gte: start, lt: end } }; })();
    const rows = await prisma.transaction.findMany({ where, select: { id: true, userId: true, type: true, kind: true, amount: true, transactionDate: true, categoryId: true, paymentMethodId: true, loanId: true, note: true, createdAt: true, updatedAt: true, category: transactionInclude.category, paymentMethod: transactionInclude.paymentMethod, loan: transactionInclude.loan }, orderBy: [{ transactionDate: "desc" }, { id: "desc" }], skip, take: limit + 1 });
    const hasNextPage = rows.length > limit; const result = hasNextPage ? rows.slice(0, limit) : rows; const response = NextResponse.json(result);
    response.headers.set("X-Page", String(page)); response.headers.set("X-Page-Size", String(limit)); response.headers.set("X-Has-Next-Page", String(hasNextPage)); return response;
  } catch (error) { if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "לא מורשה" }, { status: 401 }); return NextResponse.json({ error: "לא ניתן לטעון תנועות" }, { status: 400 }); }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(); const input = transactionSchema.parse(await req.json());
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, userId: user.id, type: input.type as TransactionType } });
    if (!category) return NextResponse.json({ error: "קטגוריה לא תקינה" }, { status: 400 });
    if (input.paymentMethodId) { const method = await prisma.paymentMethod.findFirst({ where: { id: input.paymentMethodId, userId: user.id } }); if (!method) return NextResponse.json({ error: "אמצעי תשלום לא תקין" }, { status: 400 }); }
    if (input.loanId) { const loan = await prisma.loan.findFirst({ where: { id: input.loanId, userId: user.id }, select: { id: true } }); if (!loan) return NextResponse.json({ error: "הלוואה לא תקינה" }, { status: 400 }); }
    const row = await prisma.transaction.create({ data: { userId: user.id, type: input.type, kind: input.kind as TransactionKind, amount: input.amount, transactionDate: new Date(`${input.transactionDate}T00:00:00.000Z`), categoryId: input.categoryId, paymentMethodId: input.paymentMethodId || null, loanId: input.loanId || null, note: input.note || null }, include: { category: true, paymentMethod: true, loan: true } });
    return NextResponse.json(row, { status: 201 });
  } catch { return NextResponse.json({ error: "לא ניתן ליצור תנועה" }, { status: 400 }); }
}
