import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const ruleSchema = z.object({
  pattern: z.string().trim().min(1).max(200),
  matchType: z.enum(["CONTAINS", "EXACT", "STARTS_WITH"]).default("CONTAINS"),
  categoryId: z.string().min(1),
  priority: z.number().int().min(0).max(10000).default(100),
  active: z.boolean().default(true),
});

export async function GET() {
  try {
    const user = await requireUser();
    const rules = await prisma.classificationRule.findMany({
      where: { userId: user.id },
      include: { category: { select: { id: true, name: true, type: true } } },
      orderBy: [{ active: "desc" }, { priority: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json(rules);
  } catch {
    return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = ruleSchema.parse(await req.json());
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, userId: user.id } });
    if (!category) return NextResponse.json({ error: "הקטגוריה לא נמצאה" }, { status: 404 });
    const rule = await prisma.classificationRule.create({ data: { ...input, userId: user.id } });
    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    const message = error instanceof z.ZodError ? "נתוני החוק אינם תקינים" : "לא ניתן ליצור חוק";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
