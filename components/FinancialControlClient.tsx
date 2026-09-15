"use client";

import { FormEvent, useEffect, useState } from "react";

type NetWorth = { summary: { assets: number; liabilities: number; netWorth: number }; assets: Array<{ id: string; name: string; type: string; currentValue: string | number }>; liabilities: Array<{ id: string; name: string; type: string; currentBalance: string | number }> };
type Reconciliation = { id: string; month: string; ledgerBalance: string | number; bankBalance: string | number; difference: string | number; status: string };
type Forecast = { rows: Array<{ month: string; recurringIncome: number; recurringExpenses: number; sinkingContributions: number; netCashFlow: number; status: string }> };
type Rule = { id: string; pattern: string; matchType: string; priority: number; active: boolean; category: { name: string } };
type Category = { id: string; name: string; type: "INCOME" | "EXPENSE" };

const money = (value: number | string) => `${Number(value).toLocaleString("he-IL", { maximumFractionDigits: 0 })} ₪`;

export default function FinancialControlClient() {
  const [tab, setTab] = useState("overview");
  const [netWorth, setNetWorth] = useState<NetWorth | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const [nw, fc, rc, rr, cc] = await Promise.all([fetch("/api/net-worth"), fetch("/api/forecast"), fetch("/api/reconciliation"), fetch("/api/rules"), fetch("/api/categories")]);
    if (nw.ok) setNetWorth(await nw.json());
    if (fc.ok) setForecast(await fc.json());
    if (rc.ok) setReconciliations(await rc.json());
    if (rr.ok) setRules(await rr.json());
    if (cc.ok) setCategories(await cc.json());
  }
  useEffect(() => { void load(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>, body: Record<string, unknown>, endpoint: string) {
    event.preventDefault(); setMessage("");
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    setMessage(response.ok ? "נשמר בהצלחה" : (data.error ?? "אירעה שגיאה"));
    if (response.ok) { event.currentTarget.reset(); await load(); }
  }

  return <section className="space-y-6" dir="rtl">
    <header><div className="text-sm text-slate-500">בקרה פיננסית</div><h1 className="text-3xl font-bold text-slate-900">שליטה פיננסית</h1><p className="mt-1 text-slate-600">חוקים, הון נקי, תחזית והתאמת בנק — בלי חיבור לבנק חיצוני.</p></header>
    <div className="flex flex-wrap gap-2">{[["overview","סקירה"],["rules","חוקים"],["reconcile","התאמת בנק"],["forecast","תחזית 6 חודשים"],["assets","נכסים והתחייבויות"]].map(([key,label]) => <button key={key} onClick={() => setTab(key)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === key ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200"}`}>{label}</button>)}</div>
    {message && <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">{message}</div>}

    {tab === "overview" && <div className="grid gap-4 md:grid-cols-3">
      <Card title="הון נקי" value={money(netWorth?.summary.netWorth ?? 0)} subtitle={`נכסים ${money(netWorth?.summary.assets ?? 0)} · התחייבויות ${money(netWorth?.summary.liabilities ?? 0)}`} />
      <Card title="תחזית חודש הבא" value={money(forecast?.rows?.[0]?.netCashFlow ?? 0)} subtitle={forecast?.rows?.[0]?.status === "DEFICIT" ? "⚠️ גירעון צפוי" : "מצב חיובי/יציב"} />
      <Card title="התאמות בנק" value={`${reconciliations.filter((r) => r.status === "OPEN").length} פתוחות`} subtitle="כל פער נשמר וניתן לבדיקה" />
    </div>}

    {tab === "rules" && <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <form className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3" onSubmit={(e) => { const f = new FormData(e.currentTarget); return submit(e, { pattern: f.get("pattern"), matchType: f.get("matchType"), categoryId: f.get("categoryId"), priority: Number(f.get("priority") || 100) }, "/api/rules"); }}>
        <h2 className="font-bold">חוק חדש</h2><p className="text-sm text-slate-500">לדוגמה: כל טקסט שמכיל "מיטב דש" יסווג לחיסכון.</p>
        <input name="pattern" required placeholder="טקסט לחיפוש" className="w-full rounded-xl border p-3" />
        <select name="matchType" className="w-full rounded-xl border p-3"><option value="CONTAINS">מכיל</option><option value="EXACT">מדויק</option><option value="STARTS_WITH">מתחיל ב־</option></select>
        <select name="categoryId" required className="w-full rounded-xl border p-3"><option value="">בחר קטגוריה</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input name="priority" type="number" min="0" defaultValue="100" className="w-full rounded-xl border p-3" /><button className="w-full rounded-xl bg-slate-900 p-3 font-semibold text-white">שמור חוק</button>
      </form>
      <div className="space-y-2">{rules.map((rule) => <div key={rule.id} className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center justify-between"><div><div className="font-semibold">{rule.pattern}</div><div className="text-sm text-slate-500">{rule.matchType} → {rule.category.name} · עדיפות {rule.priority}</div></div><span className="text-xs">{rule.active ? "פעיל" : "כבוי"}</span></div>)}{!rules.length && <Empty text="עדיין אין חוקים אישיים." />}</div>
    </div>}

    {tab === "reconcile" && <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <form className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3" onSubmit={(e) => { const f = new FormData(e.currentTarget); return submit(e, { month: f.get("month"), openingBalance: Number(f.get("opening")), bankBalance: Number(f.get("bank")), notes: f.get("notes") }, "/api/reconciliation"); }}>
        <h2 className="font-bold">התאמת סוף חודש</h2><input name="month" type="month" required className="w-full rounded-xl border p-3" /><input name="opening" type="number" step="0.01" required placeholder="יתרת פתיחה" className="w-full rounded-xl border p-3" /><input name="bank" type="number" step="0.01" required placeholder="יתרת בנק בפועל" className="w-full rounded-xl border p-3" /><textarea name="notes" placeholder="הערה" className="w-full rounded-xl border p-3" /><button className="w-full rounded-xl bg-slate-900 p-3 font-semibold text-white">בדוק והתאם</button>
      </form>
      <div className="space-y-2">{reconciliations.map((r) => <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="font-semibold">{new Date(r.month).toLocaleDateString("he-IL", { month: "long", year: "numeric" })}</div><div className="text-sm text-slate-600">Ledger: {money(r.ledgerBalance)} · בנק: {money(r.bankBalance)} · פער: <b>{money(r.difference)}</b></div><div className="mt-1 text-xs">{r.status === "RECONCILED" ? "🟢 תואם" : "🔴 דורש בדיקה"}</div></div>)}{!reconciliations.length && <Empty text="עדיין לא בוצעה התאמת בנק." />}</div>
    </div>}

    {tab === "forecast" && <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden"><div className="p-5"><h2 className="font-bold">מבט קדימה — 6 חודשים</h2><p className="text-sm text-slate-500">התחזית משתמשת בהכנסות קבועות, ממוצע הוצאות ו־Sinking Funds.</p></div><div className="divide-y">{forecast?.rows.map((row) => <div key={row.month} className="grid grid-cols-5 gap-2 p-4 text-sm items-center"><b>{row.month}</b><span>הכנסות {money(row.recurringIncome)}</span><span>הוצאות {money(row.recurringExpenses)}</span><span>צבירה {money(row.sinkingContributions)}</span><strong className={row.netCashFlow < 0 ? "text-red-600" : "text-emerald-600"}>{money(row.netCashFlow)}</strong></div>)}</div></div>}

    {tab === "assets" && <div className="grid gap-6 md:grid-cols-2">
      <form className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3" onSubmit={(e) => { const f = new FormData(e.currentTarget); return submit(e, { kind: "asset", name: f.get("name"), type: f.get("type"), currentValue: Number(f.get("value")) }, "/api/net-worth"); }}><h2 className="font-bold">נכס</h2><input name="name" required placeholder="שם הנכס" className="w-full rounded-xl border p-3" /><select name="type" className="w-full rounded-xl border p-3"><option value="BANK_ACCOUNT">חשבון בנק</option><option value="SAVINGS">חיסכון</option><option value="DEPOSIT">פיקדון</option><option value="PENSION">פנסיה</option><option value="TRAINING_FUND">קרן השתלמות</option><option value="VEHICLE">רכב</option><option value="PROPERTY">נכס</option><option value="OTHER">אחר</option></select><input name="value" type="number" step="0.01" required placeholder="שווי נוכחי" className="w-full rounded-xl border p-3" /><button className="rounded-xl bg-slate-900 p-3 font-semibold text-white">הוסף נכס</button></form>
      <form className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3" onSubmit={(e) => { const f = new FormData(e.currentTarget); return submit(e, { kind: "liability", name: f.get("name"), type: f.get("type"), currentBalance: Number(f.get("value")) }, "/api/net-worth"); }}><h2 className="font-bold">התחייבות</h2><input name="name" required placeholder="שם ההתחייבות" className="w-full rounded-xl border p-3" /><select name="type" className="w-full rounded-xl border p-3"><option value="MORTGAGE">משכנתא</option><option value="LOAN">הלוואה</option><option value="CREDIT_CARD">כרטיס אשראי</option><option value="OTHER">אחר</option></select><input name="value" type="number" step="0.01" required placeholder="יתרה" className="w-full rounded-xl border p-3" /><button className="rounded-xl bg-slate-900 p-3 font-semibold text-white">הוסף התחייבות</button></form>
      <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-bold mb-3">מצב נוכחי</h2><div className="grid gap-3 md:grid-cols-3"><Card title="נכסים" value={money(netWorth?.summary.assets ?? 0)} /><Card title="התחייבויות" value={money(netWorth?.summary.liabilities ?? 0)} /><Card title="הון נקי" value={money(netWorth?.summary.netWorth ?? 0)} /></div></div>
    </div>}
  </section>;
}

function Card({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-sm text-slate-500">{title}</div><div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>{subtitle && <div className="mt-2 text-xs text-slate-500">{subtitle}</div>}</div>; }
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">{text}</div>; }
