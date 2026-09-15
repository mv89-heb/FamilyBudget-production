import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { calculateAmortizationSchedule } from "@/lib/financial-control";

const schema = z.object({ principal: z.number().finite().positive().optional(), annualRate: z.number().finite().nonnegative().optional(), monthlyPayment: z.number().finite().positive().optional(), startDate: z.string().datetime().optional(), maxMonths: z.number().int().min(1).max(600).optional() });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const loan = await prisma.loan.findFirst({ where: { id, userId: user.id }, include: { amortizationEntries: { orderBy: { paymentDate: "asc" } } } });
    if (!loan) return NextResponse.json({ error: "ההלוואה לא נמצאה" }, { status: 404 });
    return NextResponse.json(loan.amortizationEntries);
  } catch { return NextResponse.json({ error: "לא מורשה" }, { status: 401 }); }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const loan = await prisma.loan.findFirst({ where: { id, userId: user.id } });
    if (!loan) return NextResponse.json({ error: "ההלוואה לא נמצאה" }, { status: 404 });
    const input = schema.parse(await req.json());
    const schedule = calculateAmortizationSchedule({ principal: input.principal ?? Number(loan.outstandingAmount ?? loan.originalAmount), annualRate: input.annualRate ?? Number(loan.interestRate ?? 0), monthlyPayment: input.monthlyPayment ?? Number(loan.monthlyPayment ?? 0), startDate: input.startDate ? new Date(input.startDate) : (loan.startDate ?? new Date()), maxMonths: input.maxMonths });
    await prisma.loanAmortizationEntry.deleteMany({ where: { loanId: id } });
    if (schedule.length) await prisma.loanAmortizationEntry.createMany({ data: schedule.map((entry) => ({ loanId: id, ...entry })) });
    return NextResponse.json(schedule, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof z.ZodError ? "נתוני לוח הסילוקין לא תקינים" : "לא ניתן ליצור לוח סילוקין" }, { status: 400 }); }
}
