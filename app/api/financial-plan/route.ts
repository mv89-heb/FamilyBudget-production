import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateDebtPayments, calculateNetExpense, calculateOperatingIncome, getIsraelMonth, monthRange, sum, toNumber, type FinancialTransaction } from "@/lib/financial-engine";

const planSchema = z.object({
  monthlySavingsTarget: z.coerce.number().min(0).max(999999999),
  weeklyLeisureBudget: z.coerce.number().min(0).max(999999999),
  emergencyFundAmount: z.coerce.number().min(0).max(999999999),
  emergencyTargetMonths: z.coerce.number().int().min(3).max(6),
});

const leisurePattern = /(בילוי|פנאי|מסעד|קפה|קולנוע|אטרקציה|בידור|יציאה|נופש|חופשה)/i;
const hardExpensePattern = /(דיור|משכנתא|ארנונה|שכירות|חשמל|מים|גז|סופר|מכולת|מזון|ביטוח|גן|מעון|חינוך|בית ספר|קייטנה|תינוק)/i;
function sectionForCategory(name: string): string {
  if (/(דיור|משכנתא|ארנונה|שכירות|חשמל|מים|גז|ביטוח דירה)/i.test(name)) return "דיור";
  if (/(מזון|סופר|מכולת|מסעד|קפה|פנאי|בילוי|קולנוע|אטרקציה|בידור)/i.test(name)) return "מחיה ופנאי";
  if (/(תחבורה|דלק|רכב|מוסך|חניה|כביש)/i.test(name)) return "תחבורה";
  if (/(ילד|גן|מעון|חינוך|בית ספר|קייטנה|תינוק)/i.test(name)) return "ילדים";
  if (/(הלווא|חוב|אשראי)/i.test(name)) return "חובות";
  return "אחר";
}
function isAutomaticHardExpense(categoryName: string): boolean { return hardExpensePattern.test(categoryName); }

export async function GET() {
  try {
    const user = await requireUser();
    const now = new Date();
    const monthName = getIsraelMonth(now);
    const { start: month, end: nextMonth } = monthRange(monthName);
    const currentWeek = new Date(now);
    const day = currentWeek.getUTCDay();
    currentWeek.setUTCDate(currentWeek.getUTCDate() - (day === 0 ? 6 : day - 1));
    currentWeek.setUTCHours(0, 0, 0, 0);

    const [plan, incomes, funds, budgets, transactions] = await Promise.all([
      prisma.financialPlan.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} }),
      prisma.incomeSource.findMany({ where: { userId: user.id, active: true }, orderBy: { name: "asc" } }),
      prisma.sinkingFund.findMany({ where: { userId: user.id, active: true }, orderBy: { dueDate: "asc" } }),
      prisma.budget.findMany({ where: { userId: user.id, month }, select: { limit: true, class: true, categoryId: true, category: { select: { name: true } } } }),
      prisma.transaction.findMany({ where: { userId: user.id, transactionDate: { gte: month, lt: nextMonth } }, select: { type: true, kind: true, amount: true, transactionDate: true, categoryId: true, category: { select: { name: true } } }, orderBy: { transactionDate: "desc" } }),
    ]);

    const normalized = transactions.map(t => ({ type: t.type, kind: t.kind, amount: toNumber(t.amount), transactionDate: t.transactionDate, categoryId: t.categoryId, categoryName: t.category?.name ?? null })) satisfies FinancialTransaction[];
    const receivedIncome = calculateOperatingIncome(normalized);
    const refunds = sum(normalized.filter(t => t.kind === "REFUND").map(t => Math.abs(t.amount)));
    const grossExpenses = sum(normalized.filter(t => t.type === "EXPENSE" && ["STANDARD", "LOAN_INTEREST"].includes(t.kind)).map(t => Math.abs(t.amount)));
    const actualExpenses = Math.max(0, calculateNetExpense(normalized));
    const configuredIncome = sum(incomes.map(i => i.monthlyAmount));
    const debtPayment = calculateDebtPayments(normalized);
    const projectedIncome = receivedIncome > 0 ? Math.max(receivedIncome, configuredIncome) : configuredIncome;
    const expenseTransactions = normalized.filter(t => t.type === "EXPENSE" && t.kind === "STANDARD");

    const hardCategoryIds = new Set(budgets.filter(b => b.class === "HARD").map(b => b.categoryId));
    const variableCategoryIds = new Set(budgets.filter(b => b.class === "VARIABLE").map(b => b.categoryId));
    const budgetCategoryIds = new Set(budgets.map(b => b.categoryId));
    const hardBudgetLimit = sum(budgets.filter(b => b.class === "HARD").map(b => b.limit));
    const variableBudgetLimit = sum(budgets.filter(b => b.class === "VARIABLE").map(b => b.limit));
    const hardActual = sum(expenseTransactions.filter(t => hardCategoryIds.has(t.categoryId ?? "") || (!variableCategoryIds.has(t.categoryId ?? "") && isAutomaticHardExpense(t.categoryName ?? ""))).map(t => t.amount));
    const variableActual = sum(expenseTransactions.filter(t => variableCategoryIds.has(t.categoryId ?? "") && !hardCategoryIds.has(t.categoryId ?? "")).map(t => t.amount));
    const unbudgetedActual = sum(expenseTransactions.filter(t => !budgetCategoryIds.has(t.categoryId ?? "")).map(t => t.amount));
    const leisureActualWeek = sum(expenseTransactions.filter(t => t.transactionDate >= currentWeek && leisurePattern.test(t.categoryName ?? "")).map(t => t.amount));
    const sinkingMonthly = sum(funds.map(f => f.monthlyContribution));
    const savings = toNumber(plan.monthlySavingsTarget);
    const availableVariable = projectedIncome - actualExpenses - debtPayment - sinkingMonthly - savings;
    const monthlyLeisure = toNumber(plan.weeklyLeisureBudget) * 4.33;
    const debtBurden = projectedIncome > 0 ? debtPayment / projectedIncome : 0;
    const essentialMonthly = hardActual > 0 ? hardActual : hardBudgetLimit;
    const emergencyMin = essentialMonthly * 3;
    const emergencyMax = essentialMonthly * 6;
    const emergencyProgress = toNumber(plan.emergencyFundAmount);
    const dataCoverage = receivedIncome > 0 || actualExpenses > 0 ? "GOOD" : configuredIncome > 0 ? "PARTIAL" : "LOW";
    const elapsedMs = Math.max(86400000, now.getTime() - month.getTime());
    const monthElapsedDays = Math.max(1, Math.ceil(elapsedMs / 86400000));
    const daysInMonth = Math.max(1, Math.round((nextMonth.getTime() - month.getTime()) / 86400000));
    const projectedVariable = variableActual > 0 ? (variableActual / monthElapsedDays) * daysInMonth : 0;
    const variableRemaining = variableBudgetLimit - variableActual;
    const hasLeisureTarget = toNumber(plan.weeklyLeisureBudget) > 0;

    const recommendation = availableVariable <= 0
      ? "אין כרגע כסף פנוי אחרי הוצאות שבוצעו, החזרי חוב, חיסכון וקופות. לפני שמגדילים הוצאות כדאי לאזן את התוכנית."
      : debtBurden >= 0.4
        ? "נטל ההלוואות גבוה. שמור על הוצאות חובה וחיסכון בסיסי, והעדף צמצום חוב יקר לפני הגדלת הוצאות פנאי."
        : hasLeisureTarget && leisureActualWeek > toNumber(plan.weeklyLeisureBudget)
          ? `הוצאות הפנאי השבוע כבר מעל היעד ב-${Math.round(leisureActualWeek - toNumber(plan.weeklyLeisureBudget)).toLocaleString("he-IL")} ₪. כדאי לעצור כאן לשאר השבוע.`
          : variableBudgetLimit > 0 && variableActual > variableBudgetLimit
            ? `ההוצאות המשתנות עברו את התקציב החודשי ב-${Math.round(variableActual - variableBudgetLimit).toLocaleString("he-IL")} ₪. כדאי לצמצם את ההוצאות המשתנות עד סוף החודש.`
            : `נשארו ${Math.round(Math.max(0, availableVariable)).toLocaleString("he-IL")} ₪ בפועל אחרי ההוצאות, החזרי החוב, החיסכון והקופות.`;

    const budgetCategoriesMap = new Map<string, { categoryId: string; name: string; class: "HARD" | "VARIABLE"; section: string; limit: number; actual: number; remaining: number; percent: number }>();
    for (const budget of budgets) {
      const limit = toNumber(budget.limit);
      const actual = sum(expenseTransactions.filter(t => t.categoryId === budget.categoryId).map(t => t.amount));
      budgetCategoriesMap.set(budget.categoryId, { categoryId: budget.categoryId, name: budget.category.name, class: budget.class, section: sectionForCategory(budget.category.name), limit, actual, remaining: limit - actual, percent: limit > 0 ? (actual / limit) * 100 : 0 });
    }
    const budgetCategories = Array.from(budgetCategoriesMap.values()).sort((a, b) => a.section.localeCompare(b.section, "he") || b.actual - a.actual || a.name.localeCompare(b.name, "he"));
    const unbudgetedByCategory = new Map<string, { categoryId: string; name: string; actual: number }>();
    for (const transaction of expenseTransactions) {
      const categoryId = transaction.categoryId ?? "uncategorized";
      if (budgetCategoryIds.has(categoryId)) continue;
      const current = unbudgetedByCategory.get(categoryId);
      unbudgetedByCategory.set(categoryId, { categoryId, name: transaction.categoryName ?? "ללא קטגוריה", actual: (current?.actual ?? 0) + transaction.amount });
    }
    const unbudgetedCategories = Array.from(unbudgetedByCategory.values()).sort((a, b) => b.actual - a.actual || a.name.localeCompare(b.name, "he"));

    return NextResponse.json({
      plan, householdSize: user.householdSize, incomes, funds, budgetCategories, unbudgetedCategories,
      summary: {
        plannedIncome: configuredIncome, receivedIncome, projectedIncome, netIncome: projectedIncome, configuredIncome, netIncomeActual: receivedIncome,
        grossExpenses, refunds, actualExpenses, fixedCommitments: hardActual, hardActual, hardBudgetLimit, sinkingMonthly, savings,
        availableVariable: Math.max(0, availableVariable), actualAvailable: availableVariable, variableActual, variableBudgetLimit, variableRemaining,
        uncategorizedActual: unbudgetedActual, unbudgetedActual, projectedVariable, weeklyLeisure: toNumber(plan.weeklyLeisureBudget), monthlyLeisure,
        leisureActualMonth: 0, leisureActualWeek, essentialMonthly, emergencyMin, emergencyMax, emergencyProgress, debtPayment, debtBurden,
        freeAfterLeisure: hasLeisureTarget ? Math.max(0, availableVariable - monthlyLeisure) : availableVariable, hasLeisureTarget, dataCoverage, recommendation,
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
