import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const planSchema = z.object({
  monthlySavingsTarget: z.coerce.number().min(0).max(999999999),
  weeklyLeisureBudget: z.coerce.number().min(0).max(999999999),
  emergencyFundAmount: z.coerce.number().min(0).max(999999999),
  emergencyTargetMonths: z.coerce.number().int().min(3).max(6),
});

const monthStart = (date = new Date()) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
const nextMonthStart = (date = new Date()) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
const weekStart = (date = new Date()) => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
  return d;
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
  if (value && typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") { const parsed = Number(value.toNumber()); return Number.isFinite(parsed) ? parsed : 0; }
  return 0;
};
const sum = (values: readonly unknown[]): number => values.reduce<number>((total, value) => total + toNumber(value), 0);
const leisurePattern = /(בילוי|פנאי|מסעד|קפה|קולנוע|אטרקציה|בידור|יציאה|נופש|חופשה)/i;

function sectionForCategory(name: string): string {
  if (/(דיור|משכנתא|ארנונה|שכירות|חשמל|מים|גז|ביטוח דירה)/i.test(name)) return "דיור";
  if (/(מזון|סופר|מכולת|מסעד|קפה|פנאי|בילוי|קולנוע|אטרקציה|בידור)/i.test(name)) return "מחיה ופנאי";
  if (/(תחבורה|דלק|רכב|מוסך|חניה|כביש)/i.test(name)) return "תחבורה";
  if (/(ילד|גן|מעון|חינוך|בית ספר|קייטנה|תינוק)/i.test(name)) return "ילדים";
  if (/(הלווא|חוב|אשראי)/i.test(name)) return "חובות";
  return "אחר";
}

export async function GET() {
  try {
    const user = await requireUser();
    const now = new Date();
    const month = monthStart(now);
    const nextMonth = nextMonthStart(now);
    const currentWeek = weekStart(now);

    const [plan, incomes, funds, budgets, transactions] = await Promise.all([
      prisma.financialPlan.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} }),
      prisma.incomeSource.findMany({ where: { userId: user.id, active: true }, orderBy: { name: "asc" } }),
      prisma.sinkingFund.findMany({ where: { userId: user.id, active: true }, orderBy: { dueDate: "asc" } }),
      prisma.budget.findMany({ where: { userId: user.id, month }, select: { limit: true, class: true, categoryId: true, category: { select: { name: true } } } }),
      prisma.transaction.findMany({
        where: { userId: user.id, transactionDate: { gte: month, lt: nextMonth } },
        select: { type: true, kind: true, amount: true, transactionDate: true, categoryId: true, category: { select: { name: true } } },
        orderBy: { transactionDate: "desc" },
      }),
    ]);

    const netIncomeActual = sum(transactions.filter(t => t.type === "INCOME" && t.kind !== "LOAN_RECEIVED" && t.kind !== "TRANSFER").map(t => t.amount));
    const expenseTransactions = transactions.filter(t => t.type === "EXPENSE" && t.kind !== "TRANSFER" && t.kind !== "CASH_WITHDRAWAL" && t.kind !== "LOAN_PRINCIPAL" && t.kind !== "LOAN_RECEIVED");
    const actualExpenses = sum(expenseTransactions.map(t => t.amount));
    const hardCategoryIds = new Set(budgets.filter(b => b.class === "HARD").map(b => b.categoryId));
    const variableCategoryIds = new Set(budgets.filter(b => b.class === "VARIABLE").map(b => b.categoryId));
    const hardBudgetLimit = sum(budgets.filter(b => b.class === "HARD").map(b => b.limit));
    const variableBudgetLimit = sum(budgets.filter(b => b.class === "VARIABLE").map(b => b.limit));
    const hardActual = sum(expenseTransactions.filter(t => hardCategoryIds.has(t.categoryId)).map(t => t.amount));
    const variableActual = sum(expenseTransactions.filter(t => variableCategoryIds.has(t.categoryId)).map(t => t.amount));
    const uncategorizedActual = Math.max(0, actualExpenses - hardActual - variableActual);
    const leisureActualMonth = sum(expenseTransactions.filter(t => leisurePattern.test(t.category?.name ?? "")).map(t => t.amount));
    const leisureActualWeek = sum(expenseTransactions.filter(t => new Date(t.transactionDate) >= currentWeek && leisurePattern.test(t.category?.name ?? "")).map(t => t.amount));
    const sinkingMonthly = sum(funds.map(f => f.monthlyContribution));
    const savings = toNumber(plan.monthlySavingsTarget);
    const configuredIncome = sum(incomes.map(i => i.monthlyAmount));
    const budgetIncome = netIncomeActual > 0 ? netIncomeActual : configuredIncome;
    const actualAvailable = budgetIncome - hardActual - variableActual - sinkingMonthly - savings;
    const availableVariable = Math.max(0, actualAvailable);
    const monthlyLeisure = toNumber(plan.weeklyLeisureBudget) * 4.33;
    const debtPayment = sum(transactions.filter(t => t.kind === "LOAN_PRINCIPAL" || t.kind === "LOAN_INTEREST").map(t => t.amount));
    const debtBurden = budgetIncome > 0 ? debtPayment / budgetIncome : 0;
    const essentialMonthly = hardActual > 0 ? hardActual : hardBudgetLimit;
    const emergencyMin = essentialMonthly * 3;
    const emergencyMax = essentialMonthly * 6;
    const emergencyProgress = toNumber(plan.emergencyFundAmount);
    const dataCoverage = netIncomeActual > 0 || actualExpenses > 0 ? "GOOD" : configuredIncome > 0 ? "PARTIAL" : "LOW";
    const monthElapsedDays = Math.max(1, Math.ceil((now.getTime() - month.getTime()) / 86400000));
    const daysInMonth = Math.round((nextMonth.getTime() - month.getTime()) / 86400000);
    const projectedVariable = variableActual > 0 ? (variableActual / monthElapsedDays) * daysInMonth : 0;
    const variableRemaining = Math.max(0, variableBudgetLimit - variableActual);
    const recommendation = availableVariable <= 0
      ? "אין כרגע כסף פנוי אחרי הוצאות שבוצעו, חיסכון וקופות. לפני שמגדילים הוצאות כדאי לאזן את התוכנית."
      : debtBurden >= 0.4
        ? "נטל ההלוואות גבוה. שמור על הוצאות חובה וחיסכון בסיסי, והעדף צמצום חוב יקר לפני הגדלת הוצאות פנאי."
        : leisureActualWeek > toNumber(plan.weeklyLeisureBudget) && toNumber(plan.weeklyLeisureBudget) > 0
          ? `הוצאות הפנאי השבוע כבר מעל היעד ב-${Math.round(leisureActualWeek - toNumber(plan.weeklyLeisureBudget)).toLocaleString("he-IL")} ₪. כדאי לעצור כאן לשאר השבוע.`
          : variableBudgetLimit > 0 && variableActual > variableBudgetLimit
            ? `ההוצאות המשתנות עברו את התקציב החודשי ב-${Math.round(variableActual - variableBudgetLimit).toLocaleString("he-IL")} ₪. כדאי לצמצם את ההוצאות המשתנות עד סוף החודש.`
            : `נשארו ${Math.round(availableVariable).toLocaleString("he-IL")} ₪ בפועל אחרי ההוצאות שנרשמו, החיסכון והקופות.`;

    const budgetCategories = budgets
      .map(b => {
        const actual = sum(expenseTransactions.filter(t => t.categoryId === b.categoryId).map(t => t.amount));
        return { categoryId: b.categoryId, name: b.category.name, class: b.class, section: sectionForCategory(b.category.name), limit: toNumber(b.limit), actual, remaining: Math.max(0, toNumber(b.limit) - actual), percent: toNumber(b.limit) > 0 ? (actual / toNumber(b.limit)) * 100 : 0 };
      })
      .sort((a, b) => a.section.localeCompare(b.section, "he") || b.actual - a.actual || a.name.localeCompare(b.name, "he"));

    return NextResponse.json({
      plan,
      householdSize: user.householdSize,
      incomes,
      funds,
      budgetCategories,
      summary: {
        netIncome: budgetIncome,
        configuredIncome,
        netIncomeActual,
        fixedCommitments: hardActual,
        hardActual,
        hardBudgetLimit,
        sinkingMonthly,
        savings,
        availableVariable,
        actualAvailable,
        variableActual,
        variableBudgetLimit,
        variableRemaining,
        uncategorizedActual,
        projectedVariable,
        weeklyLeisure: toNumber(plan.weeklyLeisureBudget),
        monthlyLeisure,
        leisureActualMonth,
        leisureActualWeek,
        essentialMonthly,
        emergencyMin,
        emergencyMax,
        emergencyProgress,
        debtPayment,
        debtBurden,
        freeAfterLeisure: Math.max(0, availableVariable - monthlyLeisure),
        dataCoverage,
        recommendation,
      },
    });
  } catch {
    return NextResponse.json({ error: "לא ניתן לטעון את התוכנית המשפחתית" }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const input = planSchema.parse(await req.json());
    const plan = await prisma.financialPlan.upsert({ where: { userId: user.id }, create: { userId: user.id, ...input }, update: input });
    return NextResponse.json(plan);
  } catch {
    return NextResponse.json({ error: "נתוני התוכנית אינם תקינים" }, { status: 400 });
  }
}
