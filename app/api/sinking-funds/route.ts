import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  targetAmount: z.coerce.number().positive().max(999999999),
  currentAmount: z.coerce.number().min(0).max(999999999).default(0),
  monthlyContribution: z.coerce.number().min(0).max(999999999),
  dueDate: z.string().date().nullable().optional(),
});
const toData = (input: z.infer<typeof schema>) => ({ ...input, dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00.000Z`) : null });
export async function GET() { try { const user = await requireUser(); return NextResponse.json(await prisma.sinkingFund.findMany({ where: { userId: user.id }, orderBy: [{ active: "desc" }, { dueDate: "asc" }] })); } catch { return NextResponse.json({ error: "לא ניתן לטעון קופות" }, { status: 400 }); } }
export async function POST(req: Request) { try { const user = await requireUser(); const input = schema.parse(await req.json()); return NextResponse.json(await prisma.sinkingFund.create({ data: { userId: user.id, ...toData(input) } }), { status: 201 }); } catch { return NextResponse.json({ error: "נתוני הקופה אינם תקינים" }, { status: 400 }); } }
export async function PATCH(req: Request) { try { const user = await requireUser(); const body = await req.json(); const id = z.string().cuid().parse(body.id); const input = schema.partial().extend({ active: z.boolean().optional() }).parse(body); delete (input as Record<string, unknown>).id; const data = { ...input, ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00.000Z`) : null } : {}) }; return NextResponse.json(await prisma.sinkingFund.update({ where: { id, userId: user.id }, data })); } catch { return NextResponse.json({ error: "לא ניתן לעדכן קופה" }, { status: 400 }); } }
export async function DELETE(req: Request) { try { const user = await requireUser(); const id = z.string().cuid().parse(new URL(req.url).searchParams.get("id")); await prisma.sinkingFund.delete({ where: { id, userId: user.id } }); return NextResponse.json({ ok: true }); } catch { return NextResponse.json({ error: "לא ניתן למחוק קופה" }, { status: 400 }); } }
