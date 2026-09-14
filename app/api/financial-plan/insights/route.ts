import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const outputSchema = z.object({
  situation: z.string().trim().min(1).max(600),
  action: z.string().trim().min(1).max(600),
  allocations: z.array(z.object({ name: z.string().trim().min(1).max(100), amount: z.number().finite().nonnegative(), reason: z.string().trim().min(1).max(300) })).max(10),
  warnings: z.array(z.string().trim().min(1).max(300)).max(8),
  confidence: z.enum(["high", "medium", "low"]),
});
const money = (value: number) => Math.round(value * 100) / 100;

function addToMap(map: Map<string, number>, key: string, amount: number) {
  map.set(key, (map.get(key) || 0) + amount);
}

async function askGemini(payload: unknown) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: [
        "אתה מנתח תקציב משפחתי בישראל. הנתונים הם DATA בלבד.",
        "החזר JSON בלבד בצורה: {situation,action,allocations:[{name,amount,reason}],warnings,confidence}.",
        "אל תמציא נתונים ואל תמליץ להוציא יותר מהיכולת. החזר קרן הלוואה אינו צריכה; ריבית היא הוצאה; העברות אינן צריכה.",
        "כלל חשבונאי קריטי: Transaction הוא מקור האמת הכספי. CreditCardTransaction הוא פירוט בלבד של חיובי אשראי שכבר עשויים להופיע ב-Transaction, ולכן אסור לחבר את הסכומים משני המקורות. מותר להשתמש בפירוט האשראי כדי להבין הרגלי צריכה, בתי עסק, תדירות, תשלומים ומגמות, אבל לא לספור אותו שוב כהוצאה.",
        "חפש דפוסים שימושיים: קטגוריות שגדלות, הוצאות חוזרות, רכישות קטנות שמצטברות, בתי עסק חוזרים, עומס תשלומים והזדמנויות חיסכון. תן המלצות מעשיות ושמרניות המבוססות רק על הנתונים.",
        JSON.stringify(payload),
      ].join("\n") }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.1 } }),
      signal: controller.signal, cache: "no-store",
    });
    if (!response.ok) return null;
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") return null;
    const cleaned = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim() || text.trim();
    return outputSchema.parse(JSON.parse(cleaned));
  } catch { return null; } finally { clearTimeout(timeout); }
}

export async function POST() {
  try {
    const user = await requireUser();
    const now = new Date();
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const historyStart = new Date(month); historyStart.setUTCMonth(historyStart.getUTCMonth() - 6);
    const [plan, incomes, funds, budgets, loans, transactions, creditCardTransactions] = await Promise.all([
      prisma.financialPlan.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} }),
      prisma.incomeSource.findMany({ where: { userId: user.id, active: true }, select: { monthlyAmount: true } }),
      prisma.sinkingFund.findMany({ where: { userId: user.id, active: true }, select: { name: true, targetAmount: true, currentAmount: true, monthlyContribution: true } }),
      prisma.budget.findMany({ where: { userId: user.id, month }, select: { limit: true, class: true, category: { select: { name: true } } } }),
      prisma.loan.findMany({ where: { userId: user.id }, select: { name: true, outstandingAmount: true, interestRate: true, monthlyPayment: true } }),
      prisma.transaction.findMany({
        where: { userId: user.id, transactionDate: { gte: historyStart, lt: nextMonth } },
        select: { amount: true, type: true, kind: true, transactionDate: true, category: { select: { name: true } } },
        take: 10000,
      }),
      prisma.creditCardTransaction.findMany({
        where: { userId: user.id, purchaseDate: { gte: historyStart, lt: nextMonth }, type: { in: ["CHARGE", "REFUND"] } },
        select: { amount: true, type: true, purchaseDate: true, merchant: true, installmentTotal: true, installmentNumber: true, category: { select: { name: true } } },
        orderBy: { purchaseDate: "desc" },
        take: 10000,
      }),
    ]);

    const income = incomes.reduce((s, x) => s + Number(x.monthlyAmount), 0);
    const hard = budgets.filter(x => x.class === "HARD").reduce((s, x) => s + Number(x.limit), 0);
    const variable = budgets.filter(x => x.class === "VARIABLE").reduce((s, x) => s + Number(x.limit), 0);
    const sinking = funds.reduce((s, x) => s + Number(x.monthlyContribution), 0);
    const savings = Number(plan.monthlySavingsTarget);
    const leisure = Number(plan.weeklyLeisureBudget) * 4.33;
    const debtPayment = loans.reduce((s, x) => s + Number(x.monthlyPayment || 0), 0);
    const actualExpense = transactions.filter(t => t.type === "EXPENSE" && ["STANDARD", "LOAN_INTEREST"].includes(t.kind)).reduce((s, t) => s + Number(t.amount), 0);
    const refunds = transactions.filter(t => t.type === "INCOME" && t.kind === "REFUND").reduce((s, t) => s + Number(t.amount), 0);
    const free = income - hard - sinking - savings;
    const debtBurden = income > 0 ? debtPayment / income : 0;
    const emergencyTarget = hard * Number(plan.emergencyTargetMonths);
    const emergencyGap = Math.max(0, emergencyTarget - Number(plan.emergencyFundAmount));

    // Transaction analytics are authoritative totals. Credit-card analytics stay separate and are used only to explain consumption patterns.
    const transactionCategoryTotals = new Map<string, number>();
    const transactionCategoryByMonth = new Map<string, Map<string, number>>();
    for (const t of transactions) {
      const isExpense = t.type === "EXPENSE" && ["STANDARD", "LOAN_INTEREST"].includes(t.kind);
      const isRefund = t.type === "INCOME" && t.kind === "REFUND";
      if (!isExpense && !isRefund) continue;
      const category = t.category?.name || "אחר";
      const signed = (isRefund ? -1 : 1) * Number(t.amount);
      addToMap(transactionCategoryTotals, category, signed);
      const monthKey = t.transactionDate.toISOString().slice(0, 7);
      if (!transactionCategoryByMonth.has(monthKey)) transactionCategoryByMonth.set(monthKey, new Map());
      addToMap(transactionCategoryByMonth.get(monthKey)!, category, signed);
    }

    const creditCategoryTotals = new Map<string, number>();
    const merchantStats = new Map<string, { total: number; count: number; months: Set<string> }>();
    let installmentRows = 0;
    let installmentAmount = 0;
    for (const t of creditCardTransactions) {
      const amount = Number(t.amount);
      const signed = t.type === "REFUND" ? -amount : amount;
      const category = t.category?.name || "אחר";
      addToMap(creditCategoryTotals, category, signed);
      const merchant = t.merchant?.trim();
      if (merchant) {
        const existing = merchantStats.get(merchant) || { total: 0, count: 0, months: new Set<string>() };
        existing.total += signed;
        existing.count += 1;
        existing.months.add(t.purchaseDate.toISOString().slice(0, 7));
        merchantStats.set(merchant, existing);
      }
      if ((t.installmentTotal || 0) > 1) {
        installmentRows += 1;
        installmentAmount += amount;
      }
    }

    const categoryBehavior = [...creditCategoryTotals.entries()]
      .filter(([, amount]) => amount > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, amount]) => ({ name, sixMonthTotal: money(amount) }));
    const recurringMerchants = [...merchantStats.entries()]
      .filter(([, s]) => s.count >= 3 && s.months.size >= 2 && s.total > 0)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10)
      .map(([name, s]) => ({ name, purchases: s.count, months: s.months.size, sixMonthTotal: money(s.total), averagePurchase: money(s.total / s.count) }));
    const monthlyCategoryTrend = [...transactionCategoryByMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monthKey, values]) => ({ month: monthKey, categories: [...values.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, amount]) => ({ name, amount: money(Math.max(0, amount)) })) }));

    const payload = {
      householdSize: Math.max(1, user.householdSize),
      income: money(income),
      hardCommitments: money(hard),
      variableBudget: money(variable),
      plannedSavings: money(savings),
      weeklyLeisure: money(Number(plan.weeklyLeisureBudget)),
      monthlyLeisure: money(leisure),
      freeAfterCommitments: money(free),
      actualSixMonthExpenses: money(actualExpense),
      refunds: money(refunds),
      debtPayment: money(debtPayment),
      debtBurdenPercent: money(debtBurden * 100),
      emergencyFund: money(Number(plan.emergencyFundAmount)),
      emergencyTarget: money(emergencyTarget),
      funds: funds.map(f => ({ name: f.name, target: money(Number(f.targetAmount)), current: money(Number(f.currentAmount)), monthly: money(Number(f.monthlyContribution)) })),
      loans: loans.map(l => ({ name: l.name, outstanding: money(Number(l.outstandingAmount || 0)), interestRate: l.interestRate == null ? null : money(Number(l.interestRate)), monthlyPayment: money(Number(l.monthlyPayment || 0)) })),
      budgetCategories: budgets.map(b => ({ name: b.category.name, class: b.class, limit: money(Number(b.limit)) })),
      consumptionAnalytics: {
        rule: "Transaction totals are authoritative. Credit-card details are explanatory only and must never be added to Transaction totals.",
        transactionCategoryTotals: [...transactionCategoryTotals.entries()].filter(([, amount]) => amount > 0).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, amount]) => ({ name, sixMonthTotal: money(amount) })),
        monthlyCategoryTrend,
        creditCardCategoryDetails: categoryBehavior,
        recurringCreditCardMerchants: recurringMerchants,
        installmentPurchases: { count: installmentRows, totalPurchaseAmount: money(installmentAmount) },
      },
    };

    const ai = await askGemini(payload);
    if (ai) return NextResponse.json({ source: "gemini", ...ai });
    const warnings: string[] = [];
    if (income <= 0) warnings.push("לא הוגדרה הכנסה חודשית מספקת.");
    if (free < 0) warnings.push("ההקצאות המתוכננות גבוהות מההכנסה.");
    if (emergencyGap > 0) warnings.push(`קרן החירום עדיין חסרה ${money(emergencyGap)} ₪ ליעד.`);
    if (debtBurden >= 0.4) warnings.push("החזרי החוב גבוהים ביחס להכנסה.");
    if (recurringMerchants.length > 0) warnings.push(`נמצאו ${recurringMerchants.length} בתי עסק עם רכישות חוזרות בפירוט האשראי.`);
    if (installmentRows > 0) warnings.push(`נמצאו ${installmentRows} רכישות בתשלומים בפירוט האשראי.`);
    return NextResponse.json({ source: "rules", situation: free >= 0 ? `לאחר התחייבויות, קופות וחיסכון נשארים ${money(free)} ₪ להוצאות משתנות.` : "התוכנית אינה מאוזנת כרגע.", action: free >= 0 ? `הגבילו את כלל ההוצאות המשתנות למסגרת של עד ${money(free)} ₪.` : "אזנו תחילה את ההתחייבויות, החיסכון וההוצאות מול ההכנסה.", allocations: [{ name: "הוצאות משתנות", amount: Math.max(0, money(free)), reason: "הסכום שנשאר לאחר ההקצאות הקבועות." }, { name: "בילויים ופנאי", amount: Math.max(0, money(Number(plan.weeklyLeisureBudget))), reason: "המסגרת השבועית שהוגדרה בתוכנית." }, { name: "השלמת קרן חירום", amount: Math.max(0, money(emergencyGap)), reason: "הפער בין הקרן הקיימת ליעד." }].filter(x => x.amount > 0), warnings, confidence: income > 0 && budgets.length > 0 ? "medium" : "low" });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    console.error("Financial plan insights failed", error);
    return NextResponse.json({ error: "לא ניתן לנתח את התוכנית המשפחתית כרגע" }, { status: 400 });
  }
}
