import { NextResponse } from "next/server";
import { budgetSchema, monthSchema } from "@/lib/validation";
import { getIsraelMonth, monthRange } from "@/lib/financial-engine";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFinancialSourceOfTruth } from "@/lib/financial-source";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const param = new URL(req.url).searchParams.get("month");
    const month = monthSchema.parse(param || getIsraelMonth());
    const financial = await getFinancialSourceOfTruth(user.id, month);
    return NextResponse.json(financial.budgets);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    return NextResponse.json({ error: "חודש לא תקין" }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = budgetSchema.parse(await req.json());
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, userId: user.id, type: "EXPENSE" } });
    if (!category) return NextResponse.json({ error: "קטגוריה לא תקינה" }, { status: 400 });
    const month = monthRange(input.month).start;
    const row = await prisma.budget.upsert({
      where: { userId_categoryId_month: { userId: user.id, categoryId: input.categoryId, month } },
      update: { limit: input.limit, class: input.class },
      create: { userId: user.id, categoryId: input.categoryId, month, limit: input.limit, class: input.class },
    });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "לא ניתן לשמור תקציב" }, { status: 400 });
  }
}
