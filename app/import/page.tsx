"use client";
import { useState } from "react";
import Link from "next/link";

type Result = { rowsImported: number; rowsSkipped: number; categoriesCreated: number; analysisMode?: "local" | "gemini" };
const MAX_FILE_BYTES = 10 * 1024 * 1024;

async function readApiResponse(response: Response) {
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  if (!text.trim()) throw new Error(`השרת החזיר תשובה ריקה (HTTP ${response.status})`);
  if (!contentType.toLowerCase().includes("application/json")) {
    if (response.status === 404) throw new Error("שירות הייבוא לא נמצא. ייתכן שהגרסה החדשה עדיין נפרסת.");
    if (response.status >= 500) throw new Error(`שגיאת שרת בזמן הייבוא (HTTP ${response.status}).`);
    throw new Error(`השרת החזיר תשובה לא צפויה (HTTP ${response.status}).`);
  }
  try { return JSON.parse(text) as Record<string, unknown>; } catch { throw new Error(`השרת החזיר JSON לא תקין (HTTP ${response.status}).`); }
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [result, setResult] = useState<Result | null>(null), [drag, setDrag] = useState(false);
  const choose = (selected: File | null) => {
    setError("");
    if (!selected) { setFile(null); return; }
    if (!/\.(xlsx|xls)$/i.test(selected.name)) return setError("ניתן להעלות רק קובץ Excel מסוג XLSX או XLS");
    if (selected.size > MAX_FILE_BYTES) return setError("הקובץ גדול מדי (מקסימום 10MB)");
    setFile(selected);
  };
  const submit = async () => {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const fd = new FormData(); fd.append("file", file);
      const response = await fetch("/api/import/excel", { method: "POST", body: fd, headers: { Accept: "application/json" }, cache: "no-store" });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "הייבוא נכשל");
      setResult(data as unknown as Result);
    } catch (e) { setError(e instanceof Error ? e.message : "אירעה שגיאה"); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <header className="page-header">
        <div><div className="eyebrow">ייבוא נתונים</div><h1 className="page-title">ייבוא תנועות מ-Excel</h1><p className="page-subtitle">העלה דוח מהבנק או מחברת האשראי והמערכת תמפה אותו אוטומטית.</p></div>
        <Link href="/import/history" className="secondary-button inline-flex items-center justify-center">היסטוריית ייבואים</Link>
      </header>

      {result ? (
        <section className="card-elevated p-6 text-center md:p-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-3xl text-emerald-600">✓</div>
          <div className="eyebrow mt-5">הייבוא הושלם בהצלחה</div>
          <h2 className="mt-2 text-2xl font-extrabold text-slate-900">הנתונים שלך מוכנים לעבודה</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{result.rowsImported} תנועות נוספו לחשבון. {result.rowsSkipped ? `${result.rowsSkipped} שורות דולגו.` : "לא נמצאו שורות שצריך לדלג עליהן."}</p>
          <div className="mx-auto mt-7 grid max-w-2xl gap-3 sm:grid-cols-3"><div className="rounded-2xl border bg-slate-50 p-5"><b className="text-2xl text-slate-900">{result.rowsImported}</b><div className="mt-1 text-xs text-slate-500">תנועות שנוספו</div></div><div className="rounded-2xl border bg-slate-50 p-5"><b className="text-2xl text-slate-900">{result.categoriesCreated}</b><div className="mt-1 text-xs text-slate-500">קטגוריות חדשות</div></div><div className="rounded-2xl border bg-slate-50 p-5"><b className="text-2xl text-slate-900">{result.rowsSkipped}</b><div className="mt-1 text-xs text-slate-500">שורות שדולגו</div></div></div>
          <div className="mt-8 flex flex-wrap justify-center gap-3"><Link href="/transactions?month=all" className="primary-button inline-flex items-center justify-center">צפה בתנועות</Link><Link href="/dashboard?month=all" className="secondary-button inline-flex items-center justify-center">לוח הבקרה</Link><button onClick={() => { setFile(null); setResult(null); }} className="secondary-button">ייבוא נוסף</button></div>
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <section className="card-elevated p-5 md:p-7">
            <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); choose(e.dataTransfer.files[0] || null); }} className={`rounded-2xl border-2 border-dashed p-8 text-center transition md:p-12 ${drag ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-slate-50/50"}`}>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-3xl">📊</div>
              <h2 className="mt-5 text-xl font-extrabold text-slate-900">העלה את קובץ ה-Excel</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">גרור את הקובץ לכאן או בחר אותו מהמחשב. המערכת תזהה את מבנה הדוח ותטפל בו עבורך.</p>
              <label className="primary-button mt-6 inline-flex cursor-pointer items-center justify-center">בחירת קובץ<input hidden type="file" accept=".xlsx,.xls" onChange={e => choose(e.target.files?.[0] || null)} /></label>
              <div className="mt-4 text-xs text-slate-400">XLSX או XLS · עד 10MB</div>
              {file && <div className="mx-auto mt-6 flex max-w-lg items-center justify-between gap-4 rounded-2xl border bg-white p-4 text-right shadow-sm"><div className="min-w-0"><b className="block truncate text-sm text-slate-900">{file.name}</b><span className="text-xs text-slate-500">{(file.size / 1024).toFixed(0)} KB · מוכן לייבוא</span></div><button type="button" onClick={() => setFile(null)} className="shrink-0 text-xs font-semibold text-red-600">הסר</button></div>}
              {error && <div role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}
              {file && <button disabled={busy} onClick={submit} className="primary-button mt-5 w-full disabled:cursor-wait disabled:opacity-60">{busy ? "Gemini מנתח את הקובץ…" : "נתח והעלה למערכת"}</button>}
            </div>
          </section>

          <aside className="card-elevated p-6">
            <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-lg">✦</div><div><h2 className="font-bold text-slate-900">ייבוא חכם</h2><p className="text-xs text-slate-500">פחות עבודה ידנית, יותר סדר.</p></div></div>
            <div className="mt-6 space-y-3">{["זיהוי עמודות בעברית ובאנגלית", "הפרדה בין הכנסות להוצאות", "זיהוי קטגוריות ואמצעי תשלום", "התעלמות משורות סיכום וריקות", "חלוקה לקבוצות בקבצים גדולים", "ניסיון חוזר אוטומטי במקרה של עיכוב"].map(item => <div key={item} className="flex gap-3 text-sm text-slate-700"><span className="text-emerald-600">✓</span><span>{item}</span></div>)}</div>
            <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50 p-4"><div className="text-sm font-bold text-amber-900">🔒 פרטיות לפני הכול</div><p className="mt-1 text-xs leading-5 text-amber-800">אל תעלה מספרי כרטיס מלאים, CVV, סיסמאות או מפתחות גישה.</p></div>
          </aside>
        </div>
      )}
    </div>
  );
}
