"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bot, Check, CheckCircle2, Loader2, Sparkles, Tag, WandSparkles } from "lucide-react";

type Transaction = { id: string; amount: number; transactionDate: string; note: string | null; categoryName: string };
type Category = { id: string; name: string };
type Suggestion = { transactionId: string; categoryId: string; confidence: number; reason: string; rulePattern: string | null; rememberRule: boolean };

const money = (value: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(value);
const REQUEST_TIMEOUT_MS = 30_000;

export default function ClassificationCenter() {
  const searchParams = useSearchParams();
  const autoStarted = useRef(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setError("");
    const response = await fetch("/api/classification", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "לא ניתן לטעון תנועות לסיווג");
    setTransactions(data.transactions);
    setCategories(data.categories);
    setSelected(data.transactions.map((row: Transaction) => row.id));
    setSuggestions([]);
  }

  const byId = useMemo(() => new Map(transactions.map((row) => [row.id, row])), [transactions]);
  const total = transactions.reduce((sum, row) => sum + row.amount, 0);

  async function askGemini() {
    if (!selected.length || busy) return;
    setBusy(true); setError(""); setMessage("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch("/api/classification", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, signal: controller.signal, body: JSON.stringify({ action: "suggest", transactionIds: selected }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Gemini לא הצליח לסווג את התנועות");
      const nextSuggestions = (data.suggestions || []).map((item: Suggestion) => ({ ...item, rememberRule: false }));
      setSuggestions(nextSuggestions);
      const localText = data.resolvedLocally ? ` ${data.resolvedLocally} תנועות זוהו מקומית בוודאות.` : "";
      const warningText = data.warning ? ` ${data.warning}` : "";
      setMessage(`נמצאו ${data.classified || nextSuggestions.length} הצעות מתוך ${data.requested || selected.length} תנועות.${localText}${warningText} כל ההצעות עדיין ממתינות לאישור שלך.`);
    } catch (e) {
      setError(e instanceof DOMException && e.name === "AbortError" ? "הניתוח ארך יותר מדי זמן. נסה שוב או נתח קבוצה קטנה יותר." : e instanceof Error ? e.message : "שגיאה בסיווג");
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "שגיאה בטעינה"));
  }, []);

  useEffect(() => {
    if (searchParams.get("autostart") !== "1" || autoStarted.current || !transactions.length || busy) return;
    autoStarted.current = true;
    void askGemini();
  }, [searchParams, transactions.length, busy]);

  function updateSuggestion(id: string, patch: Partial<Suggestion>) {
    setSuggestions((current) => current.map((item) => item.transactionId === id ? { ...item, ...patch } : item));
  }

  async function applySuggestions(items: Suggestion[]) {
    if (!items.length || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/classification", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ action: "apply", suggestions: items }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "לא ניתן לאשר את הסיווגים");
      setMessage(`${data.updated} תנועות סווגו ואושרו בהצלחה. ${data.rulesCreated ? `${data.rulesCreated} כללים נשמרו להמשך.` : ""}`.trim());
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "שגיאה באישור"); } finally { setBusy(false); }
  }

  const highConfidence = suggestions.filter((item) => item.confidence >= 90);
  const totalSuggested = highConfidence.reduce((sum, item) => sum + (byId.get(item.transactionId)?.amount || 0), 0);

  return <div dir="rtl" className="space-y-6 pb-8">
    <header className="page-header">
      <div><div className="eyebrow"><Sparkles size={14} /> סיווג חכם</div><h1 className="page-title">מרכז הסיווג החכם</h1><p className="page-subtitle">המערכת בודקת קודם כל זיהוי ודאי וכללים ששמרת, ורק אחר כך משתמשת ב-Gemini. שום שינוי לא נשמר בלי אישור שלך.</p></div>
    </header>

    <section className="grid gap-4 sm:grid-cols-3">
      <div className="card-elevated p-5"><div className="text-xs font-bold text-slate-500">ממתין לטיפול</div><div className="mt-2 text-3xl font-black text-slate-900">{transactions.length}</div><div className="mt-1 text-xs text-slate-500">{money(total)} · עדיין לא אושר</div></div>
      <div className="card-elevated p-5"><div className="text-xs font-bold text-slate-500">ממתין לאישור · ביטחון גבוה</div><div className="mt-2 text-3xl font-black text-emerald-700">{highConfidence.length}</div><div className="mt-1 text-xs text-slate-500">{money(totalSuggested)} · ≥90% ביטחון</div></div>
      <div className="card-elevated p-5"><div className="text-xs font-bold text-slate-500">קטגוריות זמינות</div><div className="mt-2 text-3xl font-black text-slate-900">{categories.length}</div><div className="mt-1 text-xs text-slate-500">Gemini רשאי לבחור רק מהן</div></div>
    </section>

    {error && <div role="alert" className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
    {message && <div role="status" className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{message}</div>}

    {transactions.length === 0 ? <section className="card-elevated p-8 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={32} /><h2 className="mt-3 text-lg font-black text-slate-900">אין כרגע תנועות שממתינות לסיווג</h2><p className="mt-1 text-sm text-slate-500">מצוין — כל התנועות טופלו או שאינן דורשות סיווג.</p></section> : <>
      <section className="card-elevated overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 p-5 md:flex-row md:items-center md:justify-between">
          <div><h2 className="font-black text-slate-900">1. בחר תנועות לניתוח</h2><p className="mt-1 text-xs text-slate-500">נשלחים ל-Gemini רק תיאור, סכום ותאריך — לא מזהי חשבון. תנועות שניתן לסווג בבטחה מטופלות מקומית ללא קריאת API.</p></div>
          <div className="flex flex-wrap gap-2"><button type="button" className="secondary-button" disabled={busy} onClick={() => setSelected(transactions.map((row) => row.id))}>בחר הכול</button><button type="button" className="secondary-button" disabled={busy} onClick={() => setSelected([])}>נקה</button><button type="button" className="primary-button inline-flex items-center gap-2" disabled={!selected.length || busy} onClick={() => void askGemini()}>{busy ? <Loader2 size={16} className="animate-spin" /> : <WandSparkles size={16} />} {busy ? "מנתח..." : `נתח ${selected.length} תנועות עם Gemini`}</button></div>
        </div>
        <div className="divide-y divide-slate-100">{transactions.map((row) => <label key={row.id} className="flex cursor-pointer items-center gap-3 p-4 transition hover:bg-slate-50"><input type="checkbox" checked={selected.includes(row.id)} disabled={busy} onChange={(e) => setSelected((current) => e.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id))} /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-sm font-bold text-slate-800">{row.note || "ללא תיאור"}</span><span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">ממתין לאישור · {row.categoryName}</span></div><div className="mt-1 text-xs text-slate-500">{new Date(row.transactionDate).toLocaleDateString("he-IL")}</div></div><strong className="text-sm text-slate-900">{money(row.amount)}</strong></label>)}</div>
      </section>

      {suggestions.length > 0 && <section className="card-elevated overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 p-5 md:flex-row md:items-center md:justify-between"><div><h2 className="font-black text-slate-900">2. הצעות שממתינות לאישור</h2><p className="mt-1 text-xs text-slate-500">התג הירוק מציין רמת ביטחון בלבד — הוא לא אומר שהסיווג נשמר. רק לחיצה על "אשר" הופכת את ההצעה לסיווג בפועל.</p></div><button type="button" className="primary-button inline-flex items-center gap-2" disabled={busy || !highConfidence.length} onClick={() => void applySuggestions(highConfidence)}><Check size={16} /> אשר את הביטחון הגבוה</button></div>
        <div className="divide-y divide-slate-100">{suggestions.map((item) => { const row = byId.get(item.transactionId); const categoryName = categories.find((category) => category.id === item.categoryId)?.name || "קטגוריה לא נמצאה"; return <div key={item.transactionId} className="grid gap-4 p-5 md:grid-cols-[1fr_auto]"><div><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-900">{row?.note || "ללא תיאור"}</strong><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">ממתין לאישור</span><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.confidence >= 90 ? "bg-emerald-50 text-emerald-700" : item.confidence >= 70 ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{item.confidence}% ביטחון</span></div><p className="mt-2 text-sm text-slate-600">{item.reason}</p><div className="mt-3 flex flex-wrap items-center gap-2"><Tag size={15} className="text-slate-400" /><select aria-label={`קטגוריה עבור ${row?.note || "תנועה"}`} value={item.categoryId} onChange={(e) => updateSuggestion(item.transactionId, { categoryId: e.target.value })} className="input-professional max-w-xs" disabled={busy}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>{item.rulePattern && <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={item.rememberRule} disabled={busy} onChange={(e) => updateSuggestion(item.transactionId, { rememberRule: e.target.checked })} /> זכור את הסיווג הזה להבא ({item.rulePattern})</label>}</div><div className="mt-2 text-xs font-semibold text-slate-500">קטגוריה מוצעת: <span className="text-slate-800">{categoryName}</span> · הסטטוס: <span className="text-amber-700">ממתין לאישור</span></div></div><div className="flex items-start justify-between gap-4 md:flex-col md:items-end"><strong className="text-sm text-slate-900">{row ? money(row.amount) : ""}</strong><button type="button" className="secondary-button inline-flex items-center gap-2" disabled={busy} onClick={() => void applySuggestions([item])}><Check size={15} /> אשר</button></div></div>; })}</div>
      </section>}
    </>}

    <section className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5 text-sm text-indigo-950"><div className="flex items-start gap-3"><Bot className="mt-0.5 shrink-0" size={19} /><div><strong>עיקרון חשוב:</strong> Gemini לא מחשב הכנסות, הוצאות, חוב, חיסכון או שווי נקי. הוא רק מציע קטגוריה קיימת. אחרי אישור, ה-LedgerEngine וכל המסכים מתעדכנים מהנתון האמיתי.</div></div></section>
  </div>;
}
