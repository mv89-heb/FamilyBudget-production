"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Item = { id: string; fileName: string; status: string; rowsDetected: number; rowsAnalyzed: number; rowsImported: number; rowsUpdated: number; rowsSkipped: number; categoriesCreated: number; paymentMethodsCreated: number; errorMessage: string | null; createdAt: string; completedAt: string | null };

export default function History() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/import/history", { cache: "no-store" })
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(typeof data.error === "string" ? data.error : "לא ניתן לטעון היסטוריה");
        return data;
      })
      .then(d => setItems(d.imports || []))
      .catch(e => setError(e instanceof Error ? e.message : "לא ניתן לטעון היסטוריה"))
      .finally(() => setLoading(false));
  }, []);

  return <main dir="rtl" className="min-h-screen bg-slate-50 p-4 md:p-8"><div className="mx-auto max-w-4xl">
    <Link href="/import" className="text-sm text-slate-500">← ייבוא חדש</Link>
    <h1 className="mt-4 text-3xl font-bold">היסטוריית ייבואים</h1>
    <p className="mt-2 text-slate-500">קבצי Excel שעיבדת במערכת</p>
    {loading ? <div className="mt-8 rounded-2xl bg-white p-8 text-center">טוען…</div> : error ? <div role="alert" className="mt-8 rounded-2xl bg-red-50 p-6 text-center text-red-700">{error}</div> : items.length === 0 ? <div className="mt-8 rounded-2xl bg-white p-10 text-center"><div className="text-4xl">📂</div><h2 className="mt-3 text-xl font-semibold">עדיין אין ייבואים</h2><Link href="/import" className="mt-5 inline-block rounded-xl bg-slate-900 px-5 py-3 text-white">ייבוא ראשון</Link></div> : <div className="mt-8 space-y-3">{items.map(i => <div key={i.id} className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4"><div className="min-w-0"><b className="block truncate">{i.fileName}</b><div className="mt-1 text-sm text-slate-500">{new Date(i.createdAt).toLocaleString("he-IL")}</div></div><span className={`shrink-0 rounded-full px-3 py-1 text-xs ${i.status === "COMPLETED" ? "bg-emerald-100 text-emerald-700" : i.status === "PROCESSING" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{i.status === "COMPLETED" ? "הושלם" : i.status === "PROCESSING" ? "בעיבוד" : "נכשל"}</span></div>
      {i.status === "COMPLETED" && <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-4"><div className="rounded-xl bg-slate-50 p-3"><b>{i.rowsImported}</b><div className="text-xs text-slate-500">נוספו</div></div><div className="rounded-xl bg-slate-50 p-3"><b>{i.rowsUpdated}</b><div className="text-xs text-slate-500">עודכנו</div></div><div className="rounded-xl bg-slate-50 p-3"><b>{i.rowsSkipped}</b><div className="text-xs text-slate-500">דולגו</div></div><div className="rounded-xl bg-slate-50 p-3"><b>{i.rowsDetected}</b><div className="text-xs text-slate-500">שורות שזוהו</div></div></div>}
      {i.status === "FAILED" && i.errorMessage && <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{i.errorMessage}</div>}
    </div>)}</div>}
  </div></main>;
}
