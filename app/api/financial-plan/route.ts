import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const planSchema = z.object({
  monthlySavingsTarget: z.coerce.number().min(0).max(999999999),
  weeklyLeisureBudget: z.coerce.number().min(0).max(999999999),
  emergencyFundAmount: z.coerce.number().min(0).max(999999999),
  emergencyTargetMonths: z.coerce.number().int().min(3).max(6),
});
const monthStart = () => { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); };

export async function GET() {
  try {
    const user = await requireUser();
    const month = monthStart();
    const [plan, incomes, funds, hardBudgets, loans] = await Promise.all([
      prisma.financialPlan.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} }),
      prisma.incomeSource.findMany({ where: { userId: user.id, active: true }, orderBy: { name: "asc" } }),
      prisma.sinkingFund.findMany({ where: { userId: user.id, active: true }, orderBy: { dueDate: "asc" } }),
      prisma.budget.findMany({ where: { userId: user.id, month, class: "HARD" }, select: { limit: true, category: { select: { name: true } } } }),
      prisma.loan.findMany({ where: { userId: user.id }, select: { monthlyPayment: true, interestRate: true, outstandingAmount: true } }),
    ]);
    const netIncome = incomes.reduce((sum, row) => sum + Number(row.monthlyAmount), 0);
    const fixedCommitments = hardBudgets.reduce((sum, row) => sum + Number(row.limit), 0);
    const sinkingMonthly = funds.reduce((sum, row) => sum + Number(row.monthlyContribution), 0);
    const savings = Number(plan.monthlySavingsTarget);
    const availableVariable = Math.max(0, netIncome - fixedCommitments - sinkingMonthly - savings);
    const essentialMonthly = fixedCommitments;
    const emergencyMin = essentialMonthly * 3;
    const emergencyMax = essentialMonthly * 6;
    const weeklyLeisure = Number(plan.weeklyLeisureBudget);
    const monthlyLeisure = weeklyLeisure * 4.33;
    const debtPayment = loans.reduce((sum, row) => sum + Number(row.monthlyPayment || 0), 0);
    const debtBurden = netIncome > 0 ? debtPayment / netIncome : 0;
    return NextResponse.json({
      plan,
      householdSize: user.householdSize,
      incomes,
      funds,
      hardBudgets,
      summary: {
        netIncome, fixedCommitments, sinkingMonthly, savings, availableVariable,
        weeklyLeisure, monthlyLeisure, essentialMonthly, emergencyMin, emergencyMax,
        emergencyProgress: Number(plan.emergencyFundAmount), debtPayment, debtBurden,
        freeAfterLeisure: Math.max(0, availableVariable - monthlyLeisure),
      },
    });
  } catch { return NextResponse.json({ error: "לא ניתן לטעון את התוכנית המשפחתית" }, { status: 400 }); }
}

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const input = planSchema.parse(await req.json());
    const plan = await prisma.financialPlan.upsert({ where: { userId: user.id }, create: { userId: user.id, ...input }, update: input });
    return NextResponse.json(plan);
  } catch { return NextResponse.json({ error: "נתוני התוכנית אינם תקינים" }, { status: 400 }); }
}
