import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getFinancialSourceOfTruth } from "@/lib/financial-source";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  originalAmount: z.coerce.number().finite().positive().max(999999999),
  outstandingAmount: z.coerce.number().finite().nonnegative().max(999999999).optional().nullable(),
  interestRate: z.coerce.number().finite().nonnegative().max(100).optional().nullable(),
  monthlyPayment: z.coerce.number().finite().nonnegative().max(999999999).optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dateOrNull(value?: string | null) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export async function GET() {
  try {
    const user = await requireUser();
    const financial = await getFinancialSourceOfTruth(user.id);
    return NextResponse.json(financial.loans);
  } catch {
    return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = schema.parse(await req.json());
    const loan = await prisma.loan.create({
      data: {
        userId: user.id,
        name: input.name,
        originalAmount: input.originalAmount,
        outstandingAmount: input.outstandingAmount ?? input.originalAmount,
        interestRate: input.interestRate ?? null,
        monthlyPayment: input.monthlyPayment ?? null,
        startDate: dateOrNull(input.startDate),
        endDate: dateOrNull(input.endDate),
      },
    });
    return NextResponse.json(loan, { status: 201 });
  } catch {
    return NextResponse.json({ error: "לא ניתן ליצור הלוואה" }, { status: 400 });
  }
}
