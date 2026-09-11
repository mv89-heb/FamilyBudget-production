"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowUpLeft, ArrowDownLeft, BarChart3, Plus, Wallet } from "lucide-react";

type Data = {
  income: number;
  expense: number;
  balance: number;
  byCategory: { name: string; amount: number }[];
  recent: { id: string; type: "INCOME" | "EXPENSE"; amount: number; date: string; category: string; paymentMethod: string | null; note: string | null }[];
};

const money = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" }).format(n);
const currentMonth = () => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}-${month}` : new Date().toISOString().slice(0, 7);
};

async function readJson(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    const text = await response.text();
    throw new Error(text.trim() || `שגיאת שרת (${response.status})`);
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || `שגיאת שרת (${response.status})`);
  return data as Data;
}

export default function Dashboard() {
  const searchParams = useSearchParams();
  const requestedMonth = searchParams.get("month");
  const initialMonth = requestedMonth === "all" || /^\d{4}-\d{2}$/.test(requestedMonth || "") ? requestedMonth || currentMonth() : currentMonth();
  const [data, setData] = useState<Data | null>(null);
  const [month, setMonth] = useState(initialMonth);
  const [error, setError] = useState("");

  useEffect(() => {
    if (requestedMonth === "all" || /^\d{4}-\d{2}$/.test(requestedMonth || "")) setMonth(requestedMonth as string);
  }, [requestedMonth]);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    fetch(`/api/dashboard?month=${encodeURIComponent(month)}`, { signal: controller.signal, cache: "no-store", headers: { Accept: "application/json" } })
      .then(readJson)
      .then(setData)
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setError(error instanceof Error ? error.message : "שגיאה בטעינת לוח הבקרה");
      });
    return () => controller.abort();
  }, [month]);

  return (
    <div>
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700"><BarChart3 size={14} /> סקירה פיננסית</div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">לוח בקרה</h1>
          <p className="mt-1 text-sm text-slate-500">התמונה הפיננסית של המשפחה, במקום אחד.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="בחירת תקופה" value={month} onChange={e => setMonth(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm"><option value={currentMonth()}>החודש הנוכחי</option><option value="all">כל התקופות</option></select>
          {month !== "all" && <input aria-label="בחירת חודש" type="month" value={month} onChange={e => setMonth(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm" />}
          <Link href="/transactions" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"><Plus size={17} /> תנועה חדשה</Link>
        </div>
      </header>

      <section className="mb-6 overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-l from-indigo-50 via-white to-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-100 text-indigo-700"><Wallet size={21} /></div><div><div className="font-bold text-slate-900">יש לך נתונים ב-Excel?</div><p className="mt-1 text-sm text-slate-500">ייבוא חכם מזהה את העמודות ומייבא את התנועות בלי עבודה ידנית.</p></div></div>
          <Link href="/import" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700">ייבוא Excel <ArrowLeft size={16} /></Link>
        </div>
      </section>

      {error ? <div role="alert" className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div> : !data ? <DashboardSkeleton /> : <>
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <MetricCard title="הכנסות" value={money(data.income)} icon={<ArrowDownLeft size={20} />} tone="income" />
          <MetricCard title="הוצאות" value={money(data.expense)} icon={<ArrowUpLeft size={20} />} tone="expense" />
          <MetricCard title="מאזן" value={money(data.balance)} icon={<Wallet size={20} />} tone="balance" />
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="card-elevated p-5">
            <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-extrabold text-slate-900">הוצאות לפי קטגוריה</h2><p className="mt-1 text-xs text-slate-400">איפה הכסף יוצא בתקופה הנבחרת</p></div></div>
            {data.byCategory.length === 0 ? <EmptyState text="אין הוצאות בתקופה זו." /> : <div className="space-y-4">{data.byCategory.map(x => <div key={x.name}><div className="mb-1.5 flex justify-between gap-3 text-sm"><span className="font-medium text-slate-700">{x.name}</span><b className="text-slate-900">{money(x.amount)}</b></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-l from-indigo-600 to-violet-500 transition-all" style={{ width: `${Math.min(100, (x.amount / (data.expense || 1)) * 100)}%` }} /></div></div>)}</div>}
          </section>
          <section className="card-elevated p-5">
            <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-extrabold text-slate-900">תנועות אחרונות</h2><p className="mt-1 text-xs text-slate-400">הפעילות האחרונה בחשבון</p></div><Link href={month === "all" ? "/transactions?month=all" : `/transactions?month=${month}`} className="inline-flex items-center gap-1 text-sm font-bold text-indigo-600 hover:text-indigo-800">לכל התנועות <ArrowLeft size={14} /></Link></div>
            {data.recent.length === 0 ? <EmptyState text="אין תנועות בתקופה זו." /> : <div className="space-y-1">{data.recent.map(r => <div key={r.id} className="flex items-center justify-between gap-4 rounded-xl px-2 py-3 transition hover:bg-slate-50"><div className="min-w-0"><div className="truncate font-semibold text-slate-800">{r.category}</div><div className="mt-0.5 text-xs text-slate-400">{new Date(r.date).toLocaleDateString("he-IL")}{r.paymentMethod ? ` · ${r.paymentMethod}` : ""}</div></div><b className={`shrink-0 text-sm ${r.type === "EXPENSE" ? "text-red-600" : "text-emerald-600"}`}>{r.type === "EXPENSE" ? "-" : "+"}{money(r.amount)}</b></div>)}</div>}
          </section>
        </div>
      </>}
    </div>
  );
}

function MetricCard({ title, value, icon, tone }: { title: string; value: string; icon: React.ReactNode; tone: "income" | "expense" | "balance" }) {
  const styles = { income: "bg-emerald-50 text-emerald-700", expense: "bg-red-50 text-red-700", balance: "bg-indigo-50 text-indigo-700" }[tone];
  return <div className="card-elevated p-5 transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-start justify-between"><div><div className="text-sm font-medium text-slate-500">{title}</div><div className="mt-2 text-2xl font-black tracking-tight text-slate-900">{value}</div></div><div className={`grid h-10 w-10 place-items-center rounded-xl ${styles}`}>{icon}</div></div></div>;
}

function EmptyState({ text }: { text: string }) { return <div className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-400">{text}</div>; }
function DashboardSkeleton() { return <div className="animate-pulse"><div className="mb-6 grid gap-4 md:grid-cols-3">{[1,2,3].map(x => <div key={x} className="h-28 rounded-2xl border border-slate-200 bg-white" />)}</div><div className="grid gap-5 lg:grid-cols-2"><div className="h-72 rounded-2xl border border-slate-200 bg-white" /><div className="h-72 rounded-2xl border border-slate-200 bg-white" /></div></div>; }
