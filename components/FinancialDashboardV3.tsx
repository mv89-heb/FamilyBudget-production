"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { FinancialKpi, MoneyValue, SectionHeader, EmptyState } from "@/components/financial";
import { financialValue } from "@/lib/data-quality";

type Category = { categoryId: string | null; categoryName: string; amount: number; sharePercent: number };
type Budget = { categoryId: string; categoryName: string; limit: number; spent: number; remaining: number; overage: number; percent: number; progressPercent: number; overBudget: boolean; status: "GOOD" | "WARNING" | "OVER" };
type Insight = { type: "POSITIVE" | "WARNING" | "ACTION"; title: string; text: string };
type DashboardData = {
  month: string;
  transactionCount: number;
  dataQuality: { ledger: "HAS_DATA" | "NO_DATA"; budget: "HAS_DATA" | "NO_DATA"; emergency: "HAS_DATA" | "NO_DATA" };
  income: number;
  expense: number;
  balance: number;
  netCashFlow: number;
  cashOutflow: number;
  actualDebtPayments: number;
  directSavings: number;
  financingActivity: number;
  financingCashFlow: number;
  debtPrincipal: number;
  debtInterest: number;
  loanReceived: number;
  refunds: number;
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

function FlowItem({ label, value, note, tone = "neutral" }: { label: string; value: number; note: string; tone?: "positive" | "neutral" | "negative" }) {
  return <div className={`rounded-2xl border p-4 ${tone === "positive" ? "border-emerald-100 bg-emerald-50" : tone === "negative" ? "border-red-100 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
    <div className="text-xs font-bold text-slate-500">{label}</div>
    <div className="mt-1 text-2xl font-black text-slate-900">{money(value)}</div>
    <div className="mt-1 text-xs font-medium text-slate-500">{note}</div>
  </div>;
}

function CategoryList({ categories, expense }: { categories: Category[]; expense: number }) {
  const [expanded, setExpanded] = useState(false);
  if (!categories.length) return <EmptyState title="אין הוצאות שוטפות" description="עדיין לא נקלטו הוצאות בחודש הזה." action={{ label: "לתנועות", href: "/transactions" }} />;
  const visible = expanded ? categories : categories.slice(0, 5);
  const hidden = categories.slice(5);
  return <div className="mt-5 space-y-2">
    {visible.map((row, i) => {
      const unknown = !row.categoryId || /^(אחר|לא סווג)$/i.test(row.categoryName.trim());
      return <a key={`${row.categoryId}-${row.categoryName}`} href="/transactions" className={`group flex items-center gap-3 rounded-xl border px-3 py-3 transition hover:border-slate-300 hover:bg-slate-50 ${unknown ? "border-amber-200 bg-amber-50/60" : "border-transparent bg-white"}`}>
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full chart-dot-${i % 6}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><span className="truncate text-sm font-bold text-slate-800">{unknown ? "אחר · דורש סיווג" : row.categoryName}</span>{unknown && <AlertTriangle size={14} className="shrink-0 text-amber-600" />}</div>
          <div className="mt-1 text-xs text-slate-500">{row.sharePercent}% מההוצאות השוטפות · {unknown ? "לחצו כדי לפתוח את התנועות ולסווג" : "קטגוריה חשבונאית קיימת"}</div>
        </div>
        <strong className="text-sm text-slate-900">{money(row.amount)}</strong>
      </a>;
    })}
    {hidden.length > 0 && <button type="button" onClick={() => setExpanded(v => !v)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">
      <ChevronDown size={16} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
      {expanded ? "הסתר קטגוריות נוספות" : `הצג עוד ${hidden.length} קטגוריות`}
    </button>}
    <div className="pt-1 text-xs text-slate-400">סה״כ הוצאות שוטפות: {money(expense)} · חובות וחיסכון מוצגים בנפרד בתזרים.</div>
  </div>;
}

export default function FinancialDashboardV3() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { const c = new AbortController(); setData(null); setError(""); fetch(`/api/dashboard?month=${encodeURIComponent(month)}`, { signal: c.signal, cache: "no-store", headers: { Accept: "application/json" } }).then(readJson).then(setData).catch((e: unknown) => { if (e instanceof Error && e.name === "AbortError") return; setError(e instanceof Error ? e.message : "שגיאה בטעינת הסקירה"); }); return () => c.abort(); }, [month]);
  const periodLabel = useMemo(() => new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`)), [month]);
  if (error) return <div dir="rtl" className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm font-semibold text-red-700" role="alert">{error}</div>;
  if (!data) return <div dir="rtl" className="space-y-4"><div className="h-24 animate-pulse rounded-2xl bg-slate-100" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1,2,3,4].map(i => <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />)}</div></div>;
  const ledgerHasData = data.dataQuality.ledger === "HAS_DATA";
  const income = financialValue(data.income, "LEDGER", { hasData: ledgerHasData });
  const operatingExpense = financialValue(data.expense, "LEDGER", { hasData: ledgerHasData });
  const netFlow = financialValue(data.netCashFlow, "LEDGER", { hasData: ledgerHasData });
  const emergency = financialValue(data.emergency.current, "SINKING_FUND", { hasData: data.dataQuality.emergency === "HAS_DATA" });
  const emergencyTarget = financialValue(data.emergency.target, "BUDGET", { hasData: data.dataQuality.emergency === "HAS_DATA" });
  const debtService = data.actualDebtPayments;
  const cashOutflow = data.cashOutflow;
  const attention = data.budgetComparisons.filter(x => x.status !== "GOOD").length;
  return <div dir="rtl" className="space-y-6 pb-8">
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><div className="eyebrow"><Wallet size={14} /> סקירה פיננסית</div><h1 className="page-title">מה קורה עם הכסף?</h1><p className="page-subtitle">{periodLabel} · הפרדה ברורה בין כסף שיצא מהחשבון לבין בניית הון.</p></div><label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold shadow-sm">חודש<input aria-label="חודש" type="month" value={month} onChange={e => setMonth(e.target.value)} className="rounded-xl bg-slate-50 px-3 py-2 outline-none" /></label></header>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><FinancialKpi label="הכנסות" value={income.value} status={income.status} tone="positive" icon={<TrendingUp size={18} />} hint={ledgerHasData ? "כל הכסף שנכנס בפועל" : "אין נתוני תנועות לחודש"} /><FinancialKpi label="הוצאות שוטפות" value={operatingExpense.value} status={operatingExpense.status} icon={<TrendingDown size={18} />} hint="צריכה, חשבונות והוצאות תפעוליות · ללא חובות וחיסכון" /><FinancialKpi label="תשלומי חוב" value={debtService} status={ledgerHasData ? "HAS_DATA" : "NO_DATA"} icon={<Wallet size={18} />} hint="סך תשלומי החוב שבוצעו בפועל בחודש הנבחר" /><FinancialKpi label="תזרים נטו" value={netFlow.value} status={netFlow.status} tone={data.netCashFlow >= 0 ? "positive" : "negative"} icon={<Wallet size={18} />} hint="הכנסות פחות כל היציאות בפועל" /></section>
    <section className="card-elevated p-5 md:p-6"><SectionHeader title="תזרים מזומנים — מה קרה בעו״ש?" description="כאן רואים את הכסף שיצא בפועל. כל יציאה נספרת פעם אחת בלבד." /><div className="mt-5 grid gap-3 sm:grid-cols-3"><FlowItem label="נכנס" value={data.income} note="הכנסות בפועל" tone="positive" /><FlowItem label="יצא בפועל" value={cashOutflow} note={`הוצאות שוטפות ${money(data.expense)} + חיסכון ${money(data.directSavings)} + חובות ${money(data.actualDebtPayments)}`} /><FlowItem label="תזרים נטו" value={data.netCashFlow} note="זה לא יתרת עו״ש; זו תנועת החודש" tone={data.netCashFlow >= 0 ? "positive" : "negative"} /></div>{data.debtPrincipal > 0 && <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900"><strong>פירוט חוב:</strong> {money(data.actualDebtPayments)} יצאו בפועל כתשלומי חוב החודש; מתוכם {money(data.debtPrincipal)} זוהו בוודאות כהחזרי קרן. הקרן מופיעה במקביל בבניית ההון כהקטנת חוב.</div>}</section>
    <section className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]"><section className="card-elevated p-5 md:p-6"><SectionHeader title="בניית הון — מה נשאר אצלנו כנכס/הפחתת חוב?" description="זה דוח מאזן/צבירת הון, לא תזרים מזומנים." /><div className="mt-5 space-y-3"><StatLine label="חיסכון ישיר" value={data.savings.directSavings} meta={`${number(data.savings.directSavingsRate)}% מההכנסה`} /><StatLine label="החזרי קרן" value={data.savings.debtPrincipalPaid} meta="הקטנת התחייבות" /><div className="rounded-2xl bg-slate-900 p-4 text-white"><span className="text-xs text-slate-300">סה״כ בניית הון</span><div className="mt-1 text-2xl font-black">{money(data.savings.wealthBuilding)}</div><div className="mt-1 text-xs text-slate-300">{number(data.savings.wealthBuildingRate)}% מההכנסה · אינו כסף פנוי</div></div></div></section><section className="card-elevated p-5 md:p-6"><SectionHeader title="קרן החירום" description="יעד שנגזר מההוצאות החיוניות; ללא יעד אמיתי לא נציג אחוז מומצא." /><div className="mt-5 flex items-end justify-between gap-4"><div><div className="text-3xl font-black text-slate-900"><MoneyValue value={emergency.value} status={emergency.status} /></div><p className="mt-1 text-xs text-slate-500">מתוך <MoneyValue value={emergencyTarget.value} status={emergencyTarget.status} showStatus={false} /></p></div><div className="grid h-20 w-20 place-items-center rounded-full border-8 border-emerald-100 text-center"><b className="text-lg">{data.emergency.target > 0 ? `${Math.round(data.emergency.progressPercent)}%` : "—"}</b></div></div>{data.emergency.target > 0 ? <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, Math.max(0, data.emergency.progressPercent))}%` }} /></div> : <div className="mt-5 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">אין מספיק נתונים כדי להציג יעד אמין.</div>}<div className="mt-4 text-sm font-semibold text-slate-600">{data.emergency.target > 0 ? (data.emergency.remaining > 0 ? `חסרים ${money(data.emergency.remaining)} ליעד.` : "היעד הושג") : "לא מחושב"}</div></section></section>
    <section className="grid gap-5 lg:grid-cols-[1fr_1fr]"><section className="card-elevated p-5 md:p-6"><SectionHeader title="לאן הכסף הולך?" description="מוצגות כאן הוצאות שוטפות בלבד; חובות וחיסכון מופרדים כדי שלא ייספרו פעמיים." action={<a className="text-sm font-bold text-indigo-600" href="/transactions">לתנועות ←</a>} /><CategoryList categories={data.byCategory} expense={data.expense} /></section><section className="card-elevated p-5 md:p-6"><SectionHeader title="תכנון מול ביצוע" description="חריגה קיימת רק מול תקציב שהוגדר בפועל." /><div className="mt-5 flex items-center justify-between rounded-2xl bg-slate-50 p-4"><div><b className="text-lg">{data.budgetComparisons.length === 0 ? "אין מסגרות" : attention === 0 ? "הכול בשליטה" : `${attention} מסגרות דורשות תשומת לב`}</b><p className="mt-1 text-xs text-slate-500">הוצאות ללא תקציב אינן מוצגות כחריגה.</p></div>{data.budgetComparisons.length === 0 ? <a href="/plan" className="text-sm font-bold text-indigo-600">להגדיר ←</a> : attention === 0 ? <CheckCircle2 className="text-emerald-600" /> : <AlertTriangle className="text-amber-500" />}</div><div className="mt-5 space-y-4">{data.budgetComparisons.slice(0, 6).map(row => <BudgetRow key={row.categoryId} row={row} />)}</div></section></section>
    <section className="card-elevated p-5 md:p-6"><SectionHeader title="מה כדאי לדעת עכשיו?" description="תובנות מהנתונים הקיימים בלבד — בלי להפוך חוסר מידע לאפס." /><div className="mt-5 space-y-3">{data.insights.length ? data.insights.slice(0, 3).map((item, i) => <div key={`${item.title}-${i}`} className={`rounded-2xl p-4 ${item.type === "WARNING" ? "bg-amber-50" : item.type === "ACTION" ? "bg-indigo-50" : "bg-emerald-50"}`}><b className="text-sm text-slate-900">{item.title}</b><p className="mt-1 text-sm leading-6 text-slate-600">{item.text}</p></div>) : <EmptyState title="אין עדיין מספיק פעילות" description="כשהנתונים יצטברו, נציג כאן תובנות שימושיות ולא ניחושים." />}</div></section>
    <section className="text-center text-xs text-slate-400">{data.transactionCount > 0 ? `${number(data.transactionCount)} תנועות בחודש · הנתונים מבוססים על תנועות החודש בפועל` : "אין תנועות בחודש הזה · לא מוצגים אפסים כאילו הם נתונים אמיתיים"}</section>
  </div>;
}
function StatLine({ label, value, meta }: { label: string; value: number; meta: string }) { return <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><div><div className="text-sm font-bold text-slate-700">{label}</div><div className="text-xs text-slate-500">{meta}</div></div><strong className="text-base text-slate-900">{money(value)}</strong></div>; }
function BudgetRow({ row }: { row: Budget }) { return <div className="rounded-xl border border-slate-100 p-3"><div className="flex items-center justify-between gap-3"><span className="text-sm font-bold text-slate-700">{row.categoryName}</span><span className="text-sm font-black text-slate-900">{money(row.spent)} / {money(row.limit)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${row.overBudget ? "bg-red-500" : row.status === "WARNING" ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${row.progressPercent}%` }} /></div><div className="mt-1 text-xs text-slate-500">{row.overBudget ? `חריגה ${money(row.overage)}` : `נותרו ${money(row.remaining)}`}</div></div>; }
