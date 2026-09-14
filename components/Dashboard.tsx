"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowDownLeft, ArrowUpLeft, BarChart3, Bell, CheckCircle2, Layers3, PiggyBank, Wallet } from "lucide-react";

type DashboardData = {
  income: number;
  expense: number;
  balance: number;
  byCategory: { name: string; amount: number }[];
  recent: { id: string; type: "INCOME" | "EXPENSE"; amount: number; date: string; category: string; paymentMethod: string | null; note: string | null }[];
};
type PlanData = {
  summary: { availableVariable: number; emergencyProgress: number; essentialMonthly: number; emergencyMax: number; uncategorizedActual: number; freeAfterLeisure: number };
  plan: { emergencyTargetMonths: number };
};
type Data = { dashboard: DashboardData; plan: PlanData | null };

const money = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);
const currentMonth = () => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = parts.find(p => p.type === "year")?.value;
  const month = parts.find(p => p.type === "month")?.value;
  return year && month ? `${year}-${month}` : new Date().toISOString().slice(0, 7);
};

async function readJson(response: Response) {
  const type = response.headers.get("content-type") || "";
  if (!type.toLowerCase().includes("application/json")) throw new Error(`שגיאת שרת (${response.status})`);
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || `שגיאת שרת (${response.status})`);
  return data;
}

export default function Dashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [month, setMonth] = useState(currentMonth());
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError("");
    Promise.all([
      fetch(`/api/dashboard?month=${encodeURIComponent(month)}`, { signal: controller.signal, cache: "no-store", headers: { Accept: "application/json" } }).then(readJson) as Promise<DashboardData>,
      fetch("/api/financial-plan", { signal: controller.signal, cache: "no-store", headers: { Accept: "application/json" } }).then(readJson).catch(() => null) as Promise<PlanData | null>,
    ]).then(([dashboard, plan]) => setData({ dashboard, plan })).catch((e: unknown) => {
      if (e instanceof Error && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "שגיאה בטעינת הסקירה");
    });
    return () => controller.abort();
  }, [month]);

  if (error) return <div role="alert" className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm font-medium text-red-700">{error}</div>;
  if (!data) return <DashboardSkeleton />;

  const d = data.dashboard;
  const p = data.plan;
  const emergencyTarget = p ? Math.max(0, p.summary.essentialMonthly * p.plan.emergencyTargetMonths) : 0;
  const emergencyPercent = emergencyTarget > 0 ? Math.min(100, Math.round((p!.summary.emergencyProgress / emergencyTarget) * 100)) : 0;
  const uncategorized = p?.summary.uncategorizedActual || d.recent.filter(r => ["אחר", "לא סווג"].includes(r.category)).reduce((sum, r) => sum + r.amount, 0) || 0;
  const alertCount = (uncategorized > 0 ? 1 : 0) + (p && p.summary.availableVariable < 0 ? 1 : 0);
  const periodLabel = new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`));

  return <div className="space-y-6" dir="rtl">
    <header className="page-header">
      <div><div className="eyebrow"><BarChart3 size={14} /> מרכז בקרה</div><h1 className="page-title">המצב המשפחתי, במבט אחד</h1><p className="page-subtitle">שלושה מספרים, כמה סימוני מצב, והצעד הבא. בלי להציף אותך בנתונים.</p></div>
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <label htmlFor="dashboard-month" className="sr-only">חודש</label>
        <input id="dashboard-month" type="month" value={month} onChange={e => setMonth(e.target.value)} className="rounded-xl border-0 bg-slate-50 px-3 py-2 text-sm font-medium outline-none" />
      </div>
    </header>

    <section className="grid gap-4 md:grid-cols-3">
      <MetricCard title="יתרה פנויה" value={money(p?.summary.availableVariable ?? d.balance)} icon={<Wallet size={20} />} tone="primary" hint="מה שנשאר אחרי ההוצאות והיעדים שהוגדרו" />
      <MetricCard title="הכנסות מול הוצאות" value={`${money(d.income)} / ${money(d.expense)}`} icon={<ArrowDownLeft size={20} />} tone={d.income >= d.expense ? "good" : "warn"} hint={`${periodLabel} · נטו ${money(d.balance)}`} />
      <MetricCard title="קרן חירום" value={p ? `${emergencyPercent}%` : "לא הוגדר"} icon={<PiggyBank size={20} />} tone={emergencyPercent >= 75 ? "good" : "neutral"} hint={p && emergencyTarget ? `${money(p.summary.emergencyProgress)} מתוך ${money(emergencyTarget)}` : "ניתן להגדיר יעד במסך תוכנית החודש"} />
    </section>

    <section className="card-elevated overflow-hidden">
      <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between md:p-6">
        <div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><Bell size={19} /></div><div><h2 className="font-extrabold text-slate-900">מה דורש תשומת לב?</h2><p className="mt-1 text-sm text-slate-500">רק דברים שדורשים פעולה — לא עוד לוח מחוונים של מספרים.</p></div></div>
        <span className={`status-badge ${alertCount ? "status-badge-danger" : "status-badge-success"}`}>{alertCount ? `${alertCount} נושאים` : "הכול נראה תקין"}</span>
      </div>
      <div className="grid border-t border-slate-100 md:grid-cols-2">
        {uncategorized > 0 ? <Link href="/transactions" className="flex items-center justify-between gap-4 p-5 transition hover:bg-slate-50"><div><strong className="block text-sm text-slate-900">יש תנועות שעדיין לא קיבלו קטגוריה</strong><span className="mt-1 block text-xs text-slate-500">{money(uncategorized)} דורשים שיוך כדי לשפר את תמונת התקציב.</span></div><ArrowLeft size={17} className="shrink-0 text-slate-400" /></Link> : <div className="flex items-center gap-3 p-5"><CheckCircle2 size={18} className="text-emerald-600" /><div><strong className="block text-sm text-slate-900">אין תנועות שממתינות לטיפול</strong><span className="mt-1 block text-xs text-slate-500">הסיווג הנוכחי נראה מסודר.</span></div></div>}
        {p && p.summary.availableVariable < 0 ? <Link href="/plan" className="flex items-center justify-between gap-4 border-t border-slate-100 p-5 transition hover:bg-slate-50 md:border-t-0 md:border-r"><div><strong className="block text-sm text-slate-900">התקציב המשתנה בחריגה</strong><span className="mt-1 block text-xs text-slate-500">המסך החודשי מציע מה לעשות מכאן.</span></div><ArrowLeft size={17} className="shrink-0 text-slate-400" /></Link> : <Link href="/plan" className="flex items-center justify-between gap-4 border-t border-slate-100 p-5 transition hover:bg-slate-50 md:border-t-0 md:border-r"><div><strong className="block text-sm text-slate-900">הצעד הבא: בדיקת תוכנית החודש</strong><span className="mt-1 block text-xs text-slate-500">בדיקה שבועית קצרה עדיפה על הפתעות בסוף החודש.</span></div><ArrowLeft size={17} className="shrink-0 text-slate-400" /></Link>}
      </div>
    </section>

    <div className="grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
      <section className="card-elevated p-5">
        <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-extrabold text-slate-900">איפה הכסף יוצא?</h2><p className="mt-1 text-xs text-slate-400">הקטגוריות הגדולות של {periodLabel}</p></div><Link href="/plan" className="text-sm font-bold text-indigo-600">לתוכנית <ArrowLeft size={14} className="inline" /></Link></div>
        {d.byCategory.length === 0 ? <EmptyState text="אין הוצאות בתקופה הזו." /> : <div className="space-y-4">{d.byCategory.slice(0, 6).map(x => <div key={x.name}><div className="mb-1.5 flex justify-between gap-3 text-sm"><span className="font-medium text-slate-700">{x.name}</span><b className="text-slate-900">{money(x.amount)}</b></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-700 transition-all" style={{ width: `${Math.min(100, (x.amount / (d.expense || 1)) * 100)}%` }} /></div></div>)}</div>}
      </section>
      <section className="card-elevated p-5">
        <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-extrabold text-slate-900">פעילות אחרונה</h2><p className="mt-1 text-xs text-slate-400">רק כמה שורות — לכל השאר עוברים למסך התנועות.</p></div><Link href="/transactions" className="text-sm font-bold text-indigo-600">לכל התנועות <ArrowLeft size={14} className="inline" /></Link></div>
        {d.recent.length === 0 ? <EmptyState text="אין תנועות בתקופה הזו." /> : <div className="space-y-1">{d.recent.slice(0, 6).map(r => <div key={r.id} className="flex items-center justify-between gap-4 rounded-xl px-2 py-3 transition hover:bg-slate-50"><div className="min-w-0"><div className="truncate font-semibold text-slate-800">{r.category || "לא סווג"}</div><div className="mt-0.5 text-xs text-slate-400">{new Date(r.date).toLocaleDateString("he-IL")}{r.paymentMethod ? ` · ${r.paymentMethod}` : ""}</div></div><b className={`shrink-0 text-sm ${r.type === "EXPENSE" ? "text-slate-800" : "text-emerald-700"}`}>{r.type === "EXPENSE" ? "-" : "+"}{money(r.amount)}</b></div>)}</div>}
      </section>
    </div>

    <section className="grid gap-3 sm:grid-cols-3">
      <QuickAction href="/transactions" icon={<Layers3 size={18} />} title="תנועות וייבוא" text="הוסף, סווג או ייבא נתונים" />
      <QuickAction href="/plan" icon={<BarChart3 size={18} />} title="תוכנית החודש" text="תכנון מול ביצוע" />
      <QuickAction href="/loans" icon={<PiggyBank size={18} />} title="התחייבויות וקופות" text="הלוואות, משכנתא וחיסכון" />
    </section>
  </div>;
}

function MetricCard({ title, value, icon, tone, hint }: { title: string; value: string; icon: ReactNode; tone: "primary" | "good" | "warn" | "neutral"; hint: string }) {
  const styles = { primary: "bg-slate-900 text-white", good: "bg-emerald-50 text-emerald-700", warn: "bg-amber-50 text-amber-700", neutral: "bg-slate-100 text-slate-600" }[tone];
  const valueClass = tone === "primary" ? "text-white" : "text-slate-900";
  return <article className="card-elevated p-5"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="text-sm font-medium text-slate-500">{title}</div><div className={`mt-2 truncate text-2xl font-black tracking-tight ${valueClass}`}>{value}</div><p className="mt-2 text-xs leading-5 text-slate-500">{hint}</p></div><div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${styles}`}>{icon}</div></div></article>;
}
function QuickAction({ href, icon, title, text }: { href: string; icon: ReactNode; title: string; text: string }) { return <Link href={href} className="card-elevated flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-md"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">{icon}</span><span><strong className="block text-sm text-slate-900">{title}</strong><small className="text-xs text-slate-500">{text}</small></span><ArrowLeft size={15} className="mr-auto text-slate-400" /></Link>; }
function EmptyState({ text }: { text: string }) { return <div className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-400">{text}</div>; }
function DashboardSkeleton() { return <div className="animate-pulse space-y-6"><div className="h-20 rounded-2xl bg-slate-200" /><div className="grid gap-4 md:grid-cols-3">{[1,2,3].map(x => <div key={x} className="h-32 rounded-2xl bg-slate-200" />)}</div><div className="h-36 rounded-2xl bg-slate-200" /><div className="grid gap-5 lg:grid-cols-2"><div className="h-72 rounded-2xl bg-slate-200" /><div className="h-72 rounded-2xl bg-slate-200" /></div></div>; }
