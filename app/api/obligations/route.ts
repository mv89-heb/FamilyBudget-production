import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFinancialSourceOfTruth } from "@/lib/financial-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const [financial, liabilities] = await Promise.all([
      getFinancialSourceOfTruth(user.id),
      prisma.liability.findMany({
        where: { userId: user.id, active: true },
        select: { id: true, name: true, type: true, currentBalance: true, monthlyPayment: true, loanId: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const linkedLoanIds = new Set(financial.loans.filter((loan) => loan.source === "MANUAL").map((loan) => loan.id));
    const standalone = liabilities
      .filter((liability) => !liability.loanId || !linkedLoanIds.has(liability.loanId))
      .map((liability) => ({
        id: `liability:${liability.id}`,
        name: liability.name,
        type: liability.type,
        source: "LIABILITY" as const,
        outstandingAmount: Number(liability.currentBalance),
        monthlyPayment: liability.monthlyPayment == null ? null : Number(liability.monthlyPayment),
      }));

    const loans = financial.loans.map((loan) => ({
      id: loan.id,
      name: loan.name,
      type: "LOAN",
      source: loan.source,
      outstandingAmount: loan.outstandingAmount,
      monthlyPayment: loan.monthlyPayment,
      originalAmount: loan.originalAmount,
      interestRate: loan.interestRate,
      startDate: loan.startDate,
      endDate: loan.endDate,
      principalPaid: loan.principalPaid,
      interestPaid: loan.interestPaid,
    }));

    return NextResponse.json({
      month: financial.month,
      obligations: [...loans, ...standalone],
      funds: [],
      totals: {
        monthlyPayment: [...loans, ...standalone].reduce((sum, item) => sum + (item.monthlyPayment ?? 0), 0),
        outstandingKnown: [...loans, ...standalone].reduce((sum, item) => sum + (item.outstandingAmount ?? 0), 0),
      },
    });
  } catch {
    return NextResponse.json({ error: "לא ניתן לטעון את ההתחייבויות" }, { status: 401 });
  }
}
