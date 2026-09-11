"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

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

  return <div><div className="mb-7 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-black">לוח בקרה</h1><p className="mt-1 text-gray-500">התמונה הפיננסית של המשפחה</p></div><div className="flex flex-wrap gap-2"><select aria-label="בחירת תקופה" value={month} onChange={e => setMonth(e.target.value)} className="rounded-xl border bg-white p-2.5"><option value={currentMonth()}>החודש הנוכחי</option><option value="all">כל התקופות</option></select>{month !== "all" && <input aria-label="בחירת חודש" type="month" value={month} onChange={e => setMonth(e.target.value)} className="rounded-xl border bg-white p-2.5" />}<Link href="/transactions" className="rounded-xl bg-gray-900 px-4 py-2.5 text-white">+ תנועה</Link></div></div><section className="mb-6 rounded-2xl border bg-gradient-to-l from-indigo-50 to-white p-5 shadow-sm"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><div className="text-lg font-bold">📥 יש לך נתונים ב-Excel?</div><p className="mt-1 text-sm text-gray-600">Gemini יכול לזהות את העמודות ולייבא את התנועות אוטומטית.</p></div><Link href="/import" className="shrink-0 rounded-xl bg-indigo-600 px-5 py-3 text-center font-bold text-white">ייבוא Excel עם Gemini</Link></div></section>{error ? <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</div> : !data ? <div className="text-gray-500">טוען...</div> : <><div className="mb-6 grid gap-4 md:grid-cols-3"><Card title="הכנסות" value={money(data.income)} /><Card title="הוצאות" value={money(data.expense)} /><Card title="מאזן" value={money(data.balance)} /></div><div className="grid gap-6 lg:grid-cols-2"><section className="rounded-2xl border bg-white p-5"><h2 className="mb-5 text-lg font-bold">הוצאות לפי קטגוריה</h2>{data.byCategory.length === 0 ? <p className="text-gray-500">אין נתונים לתקופה זו.</p> : <div className="space-y-4">{data.byCategory.map(x => <div key={x.name}><div className="mb-1 flex justify-between text-sm"><span>{x.name}</span><b>{money(x.amount)}</b></div><div className="h-3 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-gray-900" style={{ width: `${Math.min(100, (x.amount / (data.expense || 1)) * 100)}%` }} /></div></div>)}</div>}</section><section className="rounded-2xl border bg-white p-5"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-bold">תנועות אחרונות</h2><Link href={month === "all" ? "/transactions?month=all" : `/transactions?month=${month}`} className="text-sm font-medium text-indigo-600">לכל התנועות ←</Link></div><div className="space-y-3">{data.recent.map(r => <div key={r.id} className="flex items-center justify-between border-b pb-3"><div><div className="font-semibold">{r.category}</div><div className="text-xs text-gray-500">{new Date(r.date).toLocaleDateString("he-IL")}{r.paymentMethod ? ` · ${r.paymentMethod}` : ""}</div></div><b className={r.type === "EXPENSE" ? "text-red-600" : "text-green-600"}>{r.type === "EXPENSE" ? "-" : "+"}{money(r.amount)}</b></div>)}</div></section></div></>}</div>;
}

function Card({ title, value }: { title: string; value: string }) {
  return <div className="rounded-2xl border bg-white p-5"><div className="text-sm text-gray-500">{title}</div><div className="mt-2 text-2xl font-black">{value}</div></div>;
}
