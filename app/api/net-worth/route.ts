import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { calculateNetWorth } from "@/lib/financial-control";

const assetSchema = z.object({ name: z.string().trim().min(1).max(120), type: z.enum(["BANK_ACCOUNT","CASH","SAVINGS","DEPOSIT","INVESTMENT","PENSION","TRAINING_FUND","VEHICLE","PROPERTY","OTHER"]), currentValue: z.number().finite().nonnegative() });
const liabilitySchema = z.object({ name: z.string().trim().min(1).max(120), type: z.enum(["MORTGAGE","LOAN","CREDIT_CARD","OTHER"]), currentBalance: z.number().finite().nonnegative(), interestRate: z.number().finite().nonnegative().optional(), monthlyPayment: z.number().finite().nonnegative().optional(), loanId: z.string().optional() });

export async function GET() {
  try {
    const user = await requireUser();
    const [assets, liabilities, loans, snapshots] = await Promise.all([
      prisma.asset.findMany({ where: { userId: user.id, active: true }, orderBy: { name: "asc" } }),
      prisma.liability.findMany({ where: { userId: user.id, active: true }, orderBy: { name: "asc" } }),
      prisma.loan.findMany({ where: { userId: user.id }, select: { id: true, name: true, outstandingAmount: true, monthlyPayment: true, interestRate: true }, orderBy: { name: "asc" } }),
      prisma.netWorthSnapshot.findMany({ where: { userId: user.id }, orderBy: { snapshotDate: "desc" }, take: 12 }),
    ]);

    const linkedLoanIds = new Set(liabilities.map((row) => row.loanId).filter((id): id is string => Boolean(id)));
    const effectiveLiabilities = [
      ...loans.filter((loan) => loan.outstandingAmount != null).map((loan) => Number(loan.outstandingAmount)),
      ...liabilities.filter((row) => !row.loanId || !linkedLoanIds.has(row.loanId)).map((row) => Number(row.currentBalance)),
    ];
    const summary = calculateNetWorth(assets.map((row) => Number(row.currentValue)), effectiveLiabilities);
    return NextResponse.json({ assets, liabilities, loans, snapshots, summary });
  } catch (error) {
    console.error("Net worth error", error);
    return NextResponse.json({ error: "לא ניתן לטעון הון נקי" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    if (body?.kind === "asset") {
      const input = assetSchema.parse(body);
      return NextResponse.json(await prisma.asset.create({ data: { ...input, userId: user.id } }), { status: 201 });
    }
    if (body?.kind === "liability") {
      const input = liabilitySchema.parse(body);
      return NextResponse.json(await prisma.liability.create({ data: { ...input, userId: user.id } }), { status: 201 });
    }
    if (body?.kind === "snapshot") {
      const [assets, liabilities, loans] = await Promise.all([
        prisma.asset.findMany({ where: { userId: user.id, active: true }, select: { currentValue: true } }),
        prisma.liability.findMany({ where: { userId: user.id, active: true }, select: { currentBalance: true, loanId: true } }),
        prisma.loan.findMany({ where: { userId: user.id }, select: { outstandingAmount: true, id: true } }),
      ]);
      const linkedLoanIds = new Set(liabilities.map((row) => row.loanId).filter((id): id is string => Boolean(id)));
      const debt = [...loans.filter((row) => row.outstandingAmount != null).map((row) => Number(row.outstandingAmount)), ...liabilities.filter((row) => !row.loanId || !linkedLoanIds.has(row.loanId)).map((row) => Number(row.currentBalance))];
      const summary = calculateNetWorth(assets.map((r) => Number(r.currentValue)), debt);
      const date = body.snapshotDate ? new Date(body.snapshotDate) : new Date();
      const snapshot = await prisma.netWorthSnapshot.upsert({ where: { userId_snapshotDate: { userId: user.id, snapshotDate: date } }, create: { userId: user.id, snapshotDate: date, ...summary }, update: summary });
      return NextResponse.json(snapshot, { status: 201 });
    }
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? "נתונים לא תקינים" : "לא ניתן לשמור" }, { status: 400 });
  }
}
