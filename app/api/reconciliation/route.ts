import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getFinancialSourceOfTruth } from "@/lib/financial-source";
import { calculateReconciliationDifference, roundMoney } from "@/lib/financial-control";

const schema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), openingBalance: z.number().finite(), bankBalance: z.number().finite(), notes: z.string().max(1000).optional() });

function monthStart(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1));
}

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(await prisma.bankReconciliation.findMany({ where: { userId: user.id }, orderBy: { month: "desc" }, take: 12 }));
  } catch {
    return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = schema.parse(await req.json());
    const financial = await getFinancialSourceOfTruth(user.id, input.month);
    const ledgerBalance = roundMoney(input.openingBalance + financial.ledger.netCashFlow);
    const difference = calculateReconciliationDifference(ledgerBalance, input.bankBalance);
    const status = Math.abs(difference) < 0.01 ? "RECONCILED" : "OPEN";
    const month = monthStart(input.month);
    const row = await prisma.bankReconciliation.upsert({
      where: { userId_month: { userId: user.id, month } },
      create: { userId: user.id, month, ledgerBalance, bankBalance: input.bankBalance, difference, status, notes: input.notes, reconciledAt: status === "RECONCILED" ? new Date() : null },
      update: { ledgerBalance, bankBalance: input.bankBalance, difference, status, notes: input.notes, reconciledAt: status === "RECONCILED" ? new Date() : null },
    });
    return NextResponse.json({ reconciliation: row, summary: financial.ledger, transactionCount: financial.ledger ? undefined : 0 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? "נתוני התאמה לא תקינים" : "לא ניתן לבצע התאמה" }, { status: 400 });
  }
}
