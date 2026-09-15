import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  pattern: z.string().trim().min(1).max(200).optional(),
  matchType: z.enum(["CONTAINS", "EXACT", "STARTS_WITH"]).optional(),
  categoryId: z.string().min(1).optional(),
  priority: z.number().int().min(0).max(10000).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const userId = (await import("@/lib/auth")).requireUser;
    const user = await userId();
    const input = updateSchema.parse(await req.json());
    if (input.categoryId) {
      const category = await prisma.category.findFirst({ where: { id: input.categoryId, userId: user.id } });
      if (!category) return NextResponse.json({ error: "הקטגוריה לא נמצאה" }, { status: 404 });
    }
    const existing = await prisma.classificationRule.findFirst({ where: { id, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "החוק לא נמצא" }, { status: 404 });
    const row = await prisma.classificationRule.update({ where: { id }, data: input });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "לא ניתן לעדכן את החוק" }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { requireUser } = await import("@/lib/auth");
    const user = await requireUser();
    await prisma.classificationRule.deleteMany({ where: { id, userId: user.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "לא ניתן למחוק את החוק" }, { status: 400 });
  }
}
