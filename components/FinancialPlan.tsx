"use client";

import { FormEvent, useEffect, useState } from "react";

type Income = { id: string; name: string; type: "SALARY" | "BENEFIT" | "ADDITIONAL"; monthlyAmount: number | string; active: boolean };
type Fund = { id: string; name: string; targetAmount: number | string; currentAmount: number | string; monthlyContribution: number | string; dueDate: string | null; active: boolean };
type Summary = {
  netIncome: number; configuredIncome: number; netIncomeActual: number; fixedCommitments: number; hardActual: number; hardBudgetLimit: number;
  sinkingMonthly: number; savings: number; availableVariable: number; variableActual: number; variableBudgetLimit: number; variableRemaining: number;
  uncategorizedActual: number; projectedVariable: number; weeklyLeisure: number; monthlyLeisure: number; leisureActualMonth: number; leisureActualWeek: number;
  essentialMonthly: number; emergencyMin: number; emergencyMax: number; emergencyProgress: number; debtPayment: number; debtBurden: number;
  freeAfterLeisure: number; dataCoverage: "GOOD" | "PARTIAL" | "LOW"; recommendation: string;
};
type Data = { plan: { monthlySavingsTarget: number; weeklyLeisureBudget: number; emergencyFundAmount: number; emergencyTargetMonths: number }; householdSize: number; incomes: Income[]; funds: Fund[]; summary: Summary };
const money = (v: number | string) => `${Number(v).toLocaleString("he-IL", { maximumFractionDigits: 0 })} ₪`;
const incomeLabels = { SALARY: "משכורת", BENEFIT: "קצבה/הטבה", ADDITIONAL: "הכנסה נוספת" };

export default function FinancialPlan() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState({ monthlySavingsTarget: "", weeklyLeisureBudget: "", emergencyFundAmount: "", emergencyTargetMonths: "3" });
  const [income, setIncome] = useState({ name: "", type: "SALARY", monthlyAmount: "" });
  const [fund, setFund] = useState({ name: "", targetAmount: "", currentAmount: "0", monthlyContribution: "", dueDate: "" });

  async function read(response: Response) { const text = await response.text(); const body = text ? JSON.parse(text) : null; if (!response.ok) throw new Error(body?.error || "לא ניתן לשמור את הנתונים"); return body; }
  async function load() { try { const response = await fetch("/api/financial-plan", { cache: "no-store" }); const body = await read(response); setData(body); setPlan({ monthlySavingsTarget: String(body.plan.monthlySavingsTarget ?? 0), weeklyLeisureBudget: String(body.plan.weeklyLeisureBudget ?? 0), emergencyFundAmount: String(body.plan.emergencyFundAmount ?? 0), emergencyTargetMonths: String(body.plan.emergencyTargetMonths ?? 3) }); } catch (e) { setError(e instanceof Error ? e.message : "שגיאה בטעינה"); } }
  useEffect(() => { load(); }, []);
  async function savePlan(e: FormEvent) { e.preventDefault(); setSaving(true); setError(""); try { await read(await fetch("/api/financial-plan", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...plan, monthlySavingsTarget: Number(plan.monthlySavingsTarget || 0), weeklyLeisureBudget: Number(plan.weeklyLeisureBudget || 0), emergencyFundAmount: Number(plan.emergencyFundAmount || 0), emergencyTargetMonths: Number(plan.emergencyTargetMonths) }) })); await load(); } catch (e) { setError(e instanceof Error ? e.message : "לא ניתן לשמור"); } finally { setSaving(false); } }
  async function addIncome(e: FormEvent) { e.preventDefault(); try { await read(await fetch("/api/income", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...income, monthlyAmount: Number(income.monthlyAmount) }) })); setIncome({ name: "", type: "SALARY", monthlyAmount: "" }); await load(); } catch (e) { setError(e instanceof Error ? e.message : "לא ניתן להוסיף הכנסה"); } }
  async function addFund(e: FormEvent) { e.preventDefault(); try { await read(await fetch("/api/sinking-funds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fund, targetAmount: Number(fund.targetAmount), currentAmount: Number(fund.currentAmount || 0), monthlyContribution: Number(fund.monthlyContribution) }) })); setFund({ name: "", targetAmount: "", currentAmount: "0", monthlyContribution: "", dueDate: "" }); await load(); } catch (e) { setError(e instanceof Error ? e.message : "לא ניתן להוסיף קופה"); } }
  async function remove(url: string) { try { await read(await fetch(url, { method: "DELETE" })); await load(); } catch (e) { setError(e instanceof Error ? e.message : "לא ניתן למחוק"); } }
  if (!data) return <main className="page-shell"><div className="page-header"><div><p className="eyebrow">תכנון משפחתי</p><h1>תוכנית החודש</h1><p>טוען את התמונה המלאה של הכסף...</p></div></div>{error && <div className="error-banner">{error}</div>}</main>;
  const s = data.summary;
  const emergencyTarget = s.essentialMonthly * Number(plan.emergencyTargetMonths);
  const emergencyPercent = emergencyTarget > 0 ? Math.min(100, (s.emergencyProgress / emergencyTarget) * 100) : 0;
  const variablePercent = s.variableBudgetLimit > 0 ? Math.min(100, (s.variableActual / s.variableBudgetLimit) * 100) : 0;
  const hardPercent = s.hardBudgetLimit > 0 ? Math.min(100, (s.hardActual / s.hardBudgetLimit) * 100) : 0;
  const coverageLabel = s.dataCoverage === "GOOD" ? "מבוסס גם על תנועות בפועל" : s.dataCoverage === "PARTIAL" ? "מבוסס חלקית על נתוני המערכת" : "חסר מידע מספיק לתמונה מלאה";

  return <main className="page-shell" dir="rtl">
    <div className="page-header"><div><p className="eyebrow">תכנון משפחתי</p><h1>תוכנית החודש</h1><p>תמונה אחת שמחברת הכנסות, התחייבויות, חיסכון, קופות, הלוואות והוצאות בפועל.</p></div></div>
    {error && <div className="error-banner">{error}</div>}

    <section className="metrics-grid">
      <article className="metric-card"><span>הכנסה נטו</span><strong>{money(s.netIncome)}</strong><small>{s.netIncomeActual > 0 ? `${money(s.netIncomeActual)} נכנסו בפועל החודש` : "אין עדיין הכנסה בפועל החודש"}</small></article>
      <article className="metric-card"><span>התחייבויות קשיחות</span><strong>{money(s.fixedCommitments)}</strong><small>{money(s.hardActual)} בוצעו בפועל</small></article>
      <article className="metric-card"><span>נשאר לתכנון משתנה</span><strong>{money(s.availableVariable)}</strong><small>אחרי חובה, חיסכון וקופות</small></article>
      <article className="metric-card"><span>בילויים השבוע</span><strong>{money(s.leisureActualWeek)}</strong><small>יעד שבועי: {money(s.weeklyLeisure)}</small></article>
    </section>

    <section className="recommendation-card"><strong>מה המצב → מה כדאי לעשות → כמה להקצות</strong><p>{s.recommendation}</p><small>{coverageLabel} · {data.householdSize} נפשות · החזרי הלוואות: {money(s.debtPayment)} ({Math.round(s.debtBurden * 100)}% מההכנסה).</small></section>

    <section className="content-grid">
      <div className="card"><div className="card-header"><div><h2>תמונת ביצוע החודש</h2><p>התקציב מתבסס על המסגרות שהוגדרו, והביצוע נלקח מהתנועות שכבר קיימות במערכת.</p></div></div>
        <div className="stack">
          <div className="list-row"><div><strong>הוצאות חובה</strong><small>{money(s.hardActual)} מתוך {money(s.hardBudgetLimit)}</small></div><strong>{Math.round(hardPercent)}%</strong></div>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${hardPercent}%` }} /></div>
          <div className="list-row"><div><strong>הוצאות משתנות</strong><small>{money(s.variableActual)} מתוך {money(s.variableBudgetLimit || s.availableVariable)}</small></div><strong>{Math.round(variablePercent)}%</strong></div>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${variablePercent}%` }} /></div>
          <div className="list-row"><div><strong>הוצאה משתנה צפויה</strong><small>קצב ההוצאה הנוכחי לכל החודש</small></div><strong>{money(s.projectedVariable)}</strong></div>
          {s.uncategorizedActual > 0 && <div className="list-row"><div><strong>הוצאות ללא שיוך למסגרת</strong><small>צריך לסווג כדי לשפר את ההמלצה</small></div><strong>{money(s.uncategorizedActual)}</strong></div>}
        </div>
      </div>

      <div className="card"><div className="card-header"><div><h2>הכנסות נטו</h2><p>הכניסו רק כסף שבאמת נכנס למשפחה אחרי ניכויי חובה.</p></div></div>
        <div className="stack">{data.incomes.map(i => <div className="list-row" key={i.id}><div><strong>{i.name}</strong><small>{incomeLabels[i.type]}</small></div><strong>{money(i.monthlyAmount)}</strong><button className="text-button danger" onClick={() => remove(`/api/income?id=${i.id}`)}>מחיקה</button></div>)}</div>
        <form className="inline-form" onSubmit={addIncome}><input value={income.name} onChange={e => setIncome({ ...income, name: e.target.value })} placeholder="שם ההכנסה" required /><select value={income.type} onChange={e => setIncome({ ...income, type: e.target.value as Income["type"] })}><option value="SALARY">משכורת</option><option value="BENEFIT">קצבה / הטבה</option><option value="ADDITIONAL">הכנסה נוספת</option></select><input type="number" min="1" value={income.monthlyAmount} onChange={e => setIncome({ ...income, monthlyAmount: e.target.value })} placeholder="סכום חודשי" required /><button className="primary-button">הוסף</button></form>
      </div>
    </section>

    <section className="card"><div className="card-header"><div><h2>חיסכון, קרן חירום ובילויים</h2><p>המערכת מפרידה בין כסף שמיועד לעתיד לבין כסף שמותר להוציא עכשיו.</p></div></div>
      <form className="form-grid" onSubmit={savePlan}><label>חיסכון חודשי<input type="number" min="0" value={plan.monthlySavingsTarget} onChange={e => setPlan({ ...plan, monthlySavingsTarget: e.target.value })} /></label><label>בילויים לשבוע<input type="number" min="0" value={plan.weeklyLeisureBudget} onChange={e => setPlan({ ...plan, weeklyLeisureBudget: e.target.value })} /></label><label>קרן חירום קיימת<input type="number" min="0" value={plan.emergencyFundAmount} onChange={e => setPlan({ ...plan, emergencyFundAmount: e.target.value })} /></label><label>יעד קרן חירום<select value={plan.emergencyTargetMonths} onChange={e => setPlan({ ...plan, emergencyTargetMonths: e.target.value })}><option value="3">3 חודשים</option><option value="4">4 חודשים</option><option value="5">5 חודשים</option><option value="6">6 חודשים</option></select></label><button className="primary-button" disabled={saving}>{saving ? "שומר..." : "שמור תוכנית"}</button></form>
      <div className="progress-block"><div className="progress-label"><span>קרן חירום</span><strong>{money(s.emergencyProgress)} / {money(emergencyTarget)}</strong></div><div className="progress-track"><div className="progress-fill" style={{ width: `${emergencyPercent}%` }} /></div><small>טווח מומלץ: {money(s.emergencyMin)}–{money(s.emergencyMax)} לפי הוצאות החובה.</small></div>
      <div className="progress-block"><div className="progress-label"><span>פנאי החודש</span><strong>{money(s.leisureActualMonth)} / {money(s.monthlyLeisure)}</strong></div><div className="progress-track"><div className="progress-fill" style={{ width: `${s.monthlyLeisure > 0 ? Math.min(100, s.leisureActualMonth / s.monthlyLeisure * 100) : 0}%` }} /></div><small>השבוע נשארו במסגרת {money(Math.max(0, s.weeklyLeisure - s.leisureActualWeek))} לפי היעד השבועי.</small></div>
    </section>

    <section className="card"><div className="card-header"><div><h2>קופות להוצאות שנתיות</h2><p>הוצאה ידועה מראש לא צריכה להפוך לחוב. מפרישים אליה כל חודש.</p></div></div>
      <div className="stack">{data.funds.map(f => { const progress = Number(f.targetAmount) ? Math.min(100, Number(f.currentAmount) / Number(f.targetAmount) * 100) : 0; return <div className="fund-row" key={f.id}><div className="fund-main"><strong>{f.name}</strong><small>{money(f.currentAmount)} מתוך {money(f.targetAmount)} · {money(f.monthlyContribution)} בחודש{f.dueDate ? ` · עד ${new Date(f.dueDate).toLocaleDateString("he-IL")}` : ""}</small><div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div></div><button className="text-button danger" onClick={() => remove(`/api/sinking-funds?id=${f.id}`)}>מחיקה</button></div>; })}</div>
      <form className="form-grid" onSubmit={addFund}><label>שם הקופה<input value={fund.name} onChange={e => setFund({ ...fund, name: e.target.value })} placeholder="ביטוח רכב" required /></label><label>יעד<input type="number" min="1" value={fund.targetAmount} onChange={e => setFund({ ...fund, targetAmount: e.target.value })} required /></label><label>כבר הצטבר<input type="number" min="0" value={fund.currentAmount} onChange={e => setFund({ ...fund, currentAmount: e.target.value })} /></label><label>הפרשה חודשית<input type="number" min="0" value={fund.monthlyContribution} onChange={e => setFund({ ...fund, monthlyContribution: e.target.value })} required /></label><label>מועד תשלום<input type="date" value={fund.dueDate} onChange={e => setFund({ ...fund, dueDate: e.target.value })} /></label><button className="primary-button">הוסף קופה</button></form>
    </section>
  </main>;
}
