"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bell, CheckCircle2, PiggyBank, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { FinancialKpi, MoneyValue, SectionHeader, EmptyState } from "@/components/financial";
import { financialValue } from "@/lib/data-quality";

type Category = { categoryId: string | null; categoryName: string; amount: number; sharePercent: number };
type Budget = { categoryId: string; categoryName: string; limit: number; spent: number; remaining: number; overage: number; percent: number; progressPercent: number; overBudget: boolean; status: "GOOD" | "WARNING" | "OVER" };
type Insight = { type: "POSITIVE" | "WARNING" | "ACTION"; title: string; text: string };
type DashboardData = {
  month: string;
  income: number;
  expense: number;
  balance: number;
  savings: { directSavings: number; directSavingsRate: number; debtPrincipalPaid: number; wealthBuilding: number; wealthBuildingRate: number };
  emergency: { current: number; target: number; progressPercent: number; remaining: number };
  byCategory: Category[];
  budgetComparisons: Budget[];
  insights: Insight[];
  recent: { id: string; type: "INCOME" | "EXPENSE"; amount: number; date: string; category: string; paymentMethod: string | null }[];
  netWorth?: { netWorth: number; totalAssets: number; totalLiabilities: number };
  debts?: { count: number; outstanding: number; monthlyPayments: number; principalPaid: number; interestPaid: number };
};

const money = (value: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(value);
const number = (value: number) => new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 }).format(value);
function currentMonth() { const p = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit" }).formatToParts(new Date()); return `${p.find(x => x.type === "year")?.value}-${p.find(x => x.type === "month")?.value}`; }
async function readJson(r: Response) { const type = r.headers.get("content-type") || ""; if (!type.includes("application/json")) throw new Error(`שגיאת שרת (${r.status})`); const d = await r.json(); if (!r.ok) throw new Error(d?.error || `שגיאת שרת (${r.status})`); return d; }

export default function FinancialDashboardV2() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { const c = new AbortController(); setData(null); setError(""); fetch(`/api/dashboard?month=${encodeURIComponent(month)}`, { signal: c.signal, cache: "no-store", headers: { Accept: "application/json" } }).then(readJson).then(setData).catch((e: unknown) => { if (e instanceof Error && e.name === "AbortError") return; setError(e instanceof Error ? e.message : "שגיאה בטעינת הסקירה"); }); return () => c.abort(); }, [month]);
  const periodLabel = useMemo(() => new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`)), [month]);

  if (error) return <div dir="rtl" className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm font-semibold text-red-700" role="alert">{error}</div>;
  if (!data) return <DashboardLoading />;

  const netFlow = financialValue(data.balance, "LEDGER");
  const wealth = financialValue(data.savings.wealthBuilding, "LEDGER");
  const emergency = financialValue(data.emergency.current, "SINKING_FUND");
  const emergencyTarget = financialValue(data.emergency.target, "BUDGET");
  const topCategories = data.byCategory.slice(0, 5);
  const other = data.byCategory.slice(5).reduce((sum, row) => sum + row.amount, 0);
  const attention = data.budgetComparisons.filter(x => x.status !== "GOOD").length;

  return <div dir="rtl" className="space-y-6 pb-8">
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="eyebrow"><Wallet size={14} /> סקירה פיננסית</div>
        <h1 className="page-title">מה קורה עם הכסף?</h1>
        <p className="page-subtitle">{periodLabel} · תמונת מצב שמחברת בין תזרים, תכנון, חיסכון וחובות.</p>
      </div>
      <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold shadow-sm">חודש<input aria-label="חודש" type="month" value={month} onChange={e => setMonth(e.target.value)} className="rounded-xl bg-slate-50 px-3 py-2 outline-none" /></label>
    </header>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <FinancialKpi label="הכנסות" value={data.income} status={data.income === 0 ? "REAL_ZERO" : "HAS_DATA"} tone="positive" icon={<TrendingUp size={18} />} hint="הכנסות שנקלטו ב-Ledger" />
      <FinancialKpi label="הוצאות שוטפות" value={data.expense} status={data.expense === 0 ? "REAL_ZERO" : "HAS_DATA"} icon={<TrendingDown size={18} />} hint="אחרי החזרים והעברות פנימיות" />
      <FinancialKpi label="תזרים נטו" value={netFlow.value} status={netFlow.status} tone={data.balance >= 0 ? "positive" : "negative"} icon={<Wallet size={18} />} hint="מה נשאר מתזרים הפעילות החודשית" />
      <FinancialKpi label="בניית הון" value={wealth.value} status={wealth.status} tone="positive" icon={<PiggyBank size={18} />} hint={`${number(data.savings.wealthBuildingRate)}% מההכנסה`} />
    </section>

    <section className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
      <section className="card-elevated p-5 md:p-6">
        <SectionHeader title="מסלול החודש" description="הסיפור הפיננסי במקום אוסף מספרים" />
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <FlowCard title="נכנס" value={data.income} tone="positive" />
          <FlowCard title="יוצא" value={data.expense} tone="neutral" />
          <FlowCard title="נשאר" value={data.balance} tone={data.balance >= 0 ? "positive" : "negative"} />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2 text-sm font-bold text-slate-500">
          <span className="rounded-full bg-slate-100 px-3 py-1.5">הכנסות</span><ArrowLeft size={15} /><span className="rounded-full bg-slate-100 px-3 py-1.5">הוצאות</span><ArrowLeft size={15} /><span className={`rounded-full px-3 py-1.5 ${data.balance >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>תזרים נטו</span>
        </div>
      </section>

      <section className="card-elevated p-5 md:p-6">
        <SectionHeader title="קרן החירום" description="יעד שנגזר מההוצאות החיוניות" />
        <div className="mt-5 flex items-end justify-between gap-4">
          <div><div className="text-3xl font-black text-slate-900"><MoneyValue value={emergency.value} status={emergency.status} /></div><p className="mt-1 text-xs text-slate-500">מתוך <MoneyValue value={emergencyTarget.value} status={emergencyTarget.status} showStatus={false} /></p></div>
          <div className="grid h-20 w-20 place-items-center rounded-full border-8 border-emerald-100 text-center"><b className="text-lg">{Math.round(data.emergency.progressPercent)}%</b></div>
        </div>
        <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, Math.max(0, data.emergency.progressPercent))}%` }} /></div>
        <div className="mt-4 text-sm font-semibold text-slate-600">{data.emergency.remaining > 0 ? `חסרים ${money(data.emergency.remaining)} ליעד.` : "היעד הושג"}</div>
      </section>
    </section>

    <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
      <section className="card-elevated p-5 md:p-6">
        <SectionHeader title="לאן הכסף הולך?" description="חמש הקטגוריות הגדולות בלבד — כדי לשמור על תמונה ברורה" action={<a className="text-sm font-bold text-indigo-600" href="/transactions">לכל התנועות ←</a>} />
        {topCategories.length === 0 ? <EmptyState title="אין הוצאות שוטפות" description="עדיין לא נקלטו הוצאות בחודש הזה." action={{ label: "לתנועות", href: "/transactions" }} /> : <div className="mt-5 space-y-3">
          {topCategories.map((row, i) => <CategoryRow key={`${row.categoryId}-${row.categoryName}`} row={row} index={i} total={data.expense} />)}
          {other > 0 ? <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3 text-sm"><span className="font-bold text-slate-600">אחר</span><b>{money(other)}</b></div> : null}
        </div>}
      </section>

      <section className="card-elevated p-5 md:p-6">
        <SectionHeader title="תכנון מול ביצוע" description="מה דורש תשומת לב החודש" action={<a className="text-sm font-bold text-indigo-600" href="/plan">לתוכנית ←</a>} />
        <div className="mt-5 flex items-center justify-between rounded-2xl bg-slate-50 p-4"><div><b className="text-lg">{attention === 0 ? "הכול בשליטה" : `${attention} מסגרות דורשות תשומת לב`}</b><p className="mt-1 text-xs text-slate-500">חריגה מחושבת רק מול תקציב שהוגדר.</p></div>{attention === 0 ? <CheckCircle2 className="text-emerald-600" /> : <Bell className="text-amber-500" />}</div>
        <div className="mt-5 space-y-4">{data.budgetComparisons.slice(0, 5).map(row => <BudgetRow key={row.categoryId} row={row} />)}</div>
        {data.budgetComparisons.length === 0 ? <EmptyState title="אין מסגרות עדיין" description="הגדירו מסגרות בתוכנית החודש כדי שנוכל להשוות ביצוע מול יעד." action={{ label: "פתיחת תוכנית החודש", href: "/plan" }} /> : null}
      </section>
    </section>

    <section className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
      <section className="card-elevated p-5 md:p-6">
        <SectionHeader title="בניית הון" description="חיסכון ישיר + החזרי קרן" />
        <div className="mt-5 space-y-3"><StatLine label="חיסכון ישיר" value={data.savings.directSavings} meta={`${number(data.savings.directSavingsRate)}% מההכנסה`} /><StatLine label="החזרי קרן" value={data.savings.debtPrincipalPaid} meta="הפחתת חוב" /><div className="rounded-2xl bg-slate-900 p-4 text-white"><span className="text-xs text-slate-300">סה״כ בניית הון</span><div className="mt-1 text-2xl font-black">{money(data.savings.wealthBuilding)}</div></div></div>
      </section>
      <section className="card-elevated p-5 md:p-6">
        <SectionHeader title="מה כדאי לדעת עכשיו?" description="תובנות המבוססות על הנתונים הקיימים בלבד" />
        <div className="mt-5 space-y-3">{data.insights.length ? data.insights.slice(0, 3).map((item, i) => <div key={`${item.title}-${i}`} className={`rounded-2xl p-4 ${item.type === "WARNING" ? "bg-amber-50" : item.type === "ACTION" ? "bg-indigo-50" : "bg-emerald-50"}`}><b className="text-sm text-slate-900">{item.title}</b><p className="mt-1 text-sm leading-6 text-slate-600">{item.text}</p></div>) : <EmptyState title="עוד אין מספיק פעילות" description="כשהנתונים יצטברו, נציג כאן תובנות שימושיות ולא ניחושים." />}</div>
      </section>
    </section>

    <section className="card-elevated p-5 md:p-6">
      <SectionHeader title="פעילות אחרונה" description="האירועים שמרכיבים את התמונה החודשית" action={<a className="text-sm font-bold text-indigo-600" href="/transactions">כל התנועות ←</a>} />
      {data.recent.length === 0 ? <EmptyState title="אין תנועות בחודש הזה" description="ייבאו נתוני בנק או הוסיפו תנועה ידנית כדי להתחיל." action={{ label: "פתיחת תנועות", href: "/transactions" }} /> : <div className="mt-4 grid gap-2">{data.recent.slice(0, 6).map(row => <div key={row.id} className="flex items-center justify-between gap-4 rounded-xl px-3 py-3 hover:bg-slate-50"><div className="min-w-0"><b className="block truncate text-sm text-slate-800">{row.category}</b><span className="text-xs text-slate-400">{new Date(row.date).toLocaleDateString("he-IL")}{row.paymentMethod ? ` · ${row.paymentMethod}` : ""}</span></div><b className={row.type === "INCOME" ? "text-emerald-700" : "text-slate-800"}>{row.type === "INCOME" ? "+" : "-"}{money(row.amount)}</b></div>)}</div>}
    </section>
  </div>;
}

function FlowCard({ title, value, tone }: { title: string; value: number; tone: "positive" | "neutral" | "negative" }) { return <div className={`rounded-2xl border p-4 ${tone === "positive" ? "border-emerald-100 bg-emerald-50/60" : tone === "negative" ? "border-red-100 bg-red-50/60" : "border-slate-100 bg-slate-50"}`}><span className="text-xs font-bold text-slate-500">{title}</span><div className="mt-1 text-xl font-black text-slate-900">{money(value)}</div></div>; }
function CategoryRow({ row, index, total }: { row: Category; index: number; total: number }) { const pct = total > 0 ? Math.round(row.amount / total * 100) : 0; return <div className="rounded-2xl border border-slate-100 p-3"><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className={`h-3 w-3 rounded-full chart-dot-${index % 6}`} /><span className="truncate text-sm font-bold text-slate-700">{row.categoryName}</span></div><b className="text-sm">{money(row.amount)}</b></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-400" style={{ width: `${Math.min(100, pct)}%` }} /></div><div className="mt-1 text-left text-xs text-slate-400">{pct}%</div></div>; }
function BudgetRow({ row }: { row: Budget }) { const width = Math.min(100, Math.max(0, row.progressPercent)); const tone = row.status === "OVER" ? "bg-red-500" : row.status === "WARNING" ? "bg-amber-400" : "bg-emerald-500"; return <div><div className="flex items-center justify-between gap-3 text-sm"><span className="font-bold text-slate-700">{row.categoryName}</span><span className={row.overBudget ? "font-bold text-red-600" : "text-slate-500"}>{money(row.spent)} / {money(row.limit)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${tone} transition-all`} style={{ width: `${width}%` }} /></div></div>; }
function StatLine({ label, value, meta }: { label: string; value: number; meta: string }) { return <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3"><div><b className="text-sm">{label}</b><span className="mr-2 text-xs text-slate-400">{meta}</span></div><b>{money(value)}</b></div>; }
function DashboardLoading() { return <div dir="rtl" className="space-y-5">{[1,2,3,4].map(i => <div key={i} className="h-28 animate-pulse rounded-3xl bg-slate-100" />)}</div>; }
