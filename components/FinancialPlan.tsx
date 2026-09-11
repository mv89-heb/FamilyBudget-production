"use client";

import { FormEvent, useEffect, useState } from "react";

type Income = { id: string; name: string; type: "SALARY" | "BENEFIT" | "ADDITIONAL"; monthlyAmount: number | string; active: boolean };
type Fund = { id: string; name: string; targetAmount: number | string; currentAmount: number | string; monthlyContribution: number | string; dueDate: string | null; active: boolean };
type BudgetCategory = { categoryId: string; name: string; class: "HARD" | "VARIABLE"; section: string; limit: number; actual: number; remaining: number; percent: number };
type Summary = {
  netIncome: number; configuredIncome: number; netIncomeActual: number; fixedCommitments: number; hardActual: number; hardBudgetLimit: number;
  sinkingMonthly: number; savings: number; availableVariable: number; variableActual: number; variableBudgetLimit: number; variableRemaining: number;
  uncategorizedActual: number; projectedVariable: number; weeklyLeisure: number; monthlyLeisure: number; leisureActualMonth: number; leisureActualWeek: number;
  essentialMonthly: number; emergencyMin: number; emergencyMax: number; emergencyProgress: number; debtPayment: number; debtBurden: number;
  freeAfterLeisure: number; dataCoverage: "GOOD" | "PARTIAL" | "LOW"; recommendation: string;
};
type Data = { plan: { monthlySavingsTarget: number; weeklyLeisureBudget: number; emergencyFundAmount: number; emergencyTargetMonths: number }; householdSize: number; incomes: Income[]; funds: Fund[]; budgetCategories: BudgetCategory[]; summary: Summary };

const money = (v: number | string) => `${Number(v).toLocaleString("he-IL", { maximumFractionDigits: 0 })} ₪`;
const incomeLabels = { SALARY: "משכורת", BENEFIT: "קצבה/הטבה", ADDITIONAL: "הכנסה נוספת" };
const progressTone = (percent: number) => percent <= 75 ? "safe" : percent <= 90 ? "warn" : "danger";

export default function FinancialPlan() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState({ monthlySavingsTarget: "", weeklyLeisureBudget: "", emergencyFundAmount: "", emergencyTargetMonths: "3" });
  const [income, setIncome] = useState({ name: "", type: "SALARY", monthlyAmount: "" });
  const [fund, setFund] = useState({ name: "", targetAmount: "", currentAmount: "0", monthlyContribution: "", dueDate: "" });

  async function read(response: Response) {
    const text = await response.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { throw new Error("השרת החזיר תשובה לא תקינה"); }
    if (!response.ok) throw new Error(body?.error || "לא ניתן לשמור את הנתונים");
    return body;
  }

  async function load() {
    try {
      const body = await read(await fetch("/api/financial-plan", { cache: "no-store" }));
      setData(body);
      setPlan({
        monthlySavingsTarget: String(body.plan.monthlySavingsTarget ?? 0),
        weeklyLeisureBudget: String(body.plan.weeklyLeisureBudget ?? 0),
        emergencyFundAmount: String(body.plan.emergencyFundAmount ?? 0),
        emergencyTargetMonths: String(body.plan.emergencyTargetMonths ?? 3),
      });
    } catch (e) { setError(e instanceof Error ? e.message : "שגיאה בטעינה"); }
  }

  useEffect(() => { load(); }, []);

  async function savePlan(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await read(await fetch("/api/financial-plan", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...plan, monthlySavingsTarget: Number(plan.monthlySavingsTarget || 0), weeklyLeisureBudget: Number(plan.weeklyLeisureBudget || 0), emergencyFundAmount: Number(plan.emergencyFundAmount || 0), emergencyTargetMonths: Number(plan.emergencyTargetMonths) }),
      }));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "לא ניתן לשמור"); } finally { setSaving(false); }
  }

  async function addIncome(e: FormEvent) {
    e.preventDefault(); setError("");
    try {
      await read(await fetch("/api/income", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...income, monthlyAmount: Number(income.monthlyAmount) }) }));
      setIncome({ name: "", type: "SALARY", monthlyAmount: "" }); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "לא ניתן להוסיף הכנסה"); }
  }

  async function addFund(e: FormEvent) {
    e.preventDefault(); setError("");
    try {
      await read(await fetch("/api/sinking-funds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fund, targetAmount: Number(fund.targetAmount), currentAmount: Number(fund.currentAmount || 0), monthlyContribution: Number(fund.monthlyContribution) }) }));
      setFund({ name: "", targetAmount: "", currentAmount: "0", monthlyContribution: "", dueDate: "" }); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "לא ניתן להוסיף קופה"); }
  }

  async function remove(url: string) {
    try { await read(await fetch(url, { method: "DELETE" })); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "לא ניתן למחוק"); }
  }

  if (!data) return <main className="page-shell"><div className="page-header"><div><p className="eyebrow">תכנון משפחתי</p><h1>תוכנית החודש</h1><p>טוען את תמונת קבלת ההחלטות...</p></div></div>{error && <div className="error-banner">{error}</div>}</main>;

  const s = data.summary;
  const emergencyTarget = s.essentialMonthly * Number(plan.emergencyTargetMonths);
  const emergencyPercent = emergencyTarget > 0 ? Math.min(100, (s.emergencyProgress / emergencyTarget) * 100) : 0;
  const grouped = data.budgetCategories.reduce<Record<string, BudgetCategory[]>>((acc, item) => { (acc[item.section] ||= []).push(item); return acc; }, {});
  const sections = Object.entries(grouped);
  const hardPercent = s.hardBudgetLimit > 0 ? Math.min(100, (s.hardActual / s.hardBudgetLimit) * 100) : 0;
  const variablePercent = s.variableBudgetLimit > 0 ? Math.min(100, (s.variableActual / s.variableBudgetLimit) * 100) : 0;
  const coverageLabel = s.dataCoverage === "GOOD" ? "מבוסס על נתוני בפועל" : s.dataCoverage === "PARTIAL" ? "מבוסס חלקית על נתוני המערכת" : "חסר מידע מספיק";

  return <main className="page-shell decision-page" dir="rtl">
    <div className="page-header">
      <div><p className="eyebrow">קבלת החלטות · החודש הנוכחי</p><h1>תוכנית החודש</h1><p>שלושה מספרים כדי להבין איפה אנחנו, ואז פירוט רק כשצריך.</p></div>
      <span className="data-status">{coverageLabel}</span>
    </div>
    {error && <div className="error-banner">{error}</div>}

    <section className="decision-metrics">
      <article className="decision-metric"><span>סך הכנסות נטו</span><strong>{money(s.netIncome)}</strong><small>{s.netIncomeActual > 0 ? `${money(s.netIncomeActual)} נכנסו בפועל` : "לפי ההכנסה שהוגדרה"}</small></article>
      <article className="decision-metric"><span>סך הוצאות קשיחות</span><strong>{money(s.fixedCommitments)}</strong><small>{money(s.hardActual)} בוצעו עד עכשיו</small></article>
      <article className="decision-metric decision-metric-primary"><span>יתרה פנויה בפועל</span><strong>{money(s.availableVariable)}</strong><small>אחרי חובה, חיסכון וקופות</small></article>
    </section>

    <section className="decision-callout"><div><strong>מה עושים עכשיו?</strong><p>{s.recommendation}</p></div><div className="decision-callout-side"><span>פנוי אחרי יעד פנאי חודשי</span><strong>{money(s.freeAfterLeisure)}</strong></div></section>

    <section className="decision-card">
      <div className="decision-card-header"><div><h2>התקדמות התקציב</h2><p>ירוק עד 75%, צהוב עד 90%, אדום בחריגה.</p></div></div>
      <div className="overview-progress-grid">
        <div><div className="progress-heading"><span>הוצאות קשיחות</span><strong>{Math.round(hardPercent)}%</strong></div><div className={`decision-progress ${progressTone(hardPercent)}`}><div style={{ width: `${hardPercent}%` }} /></div><small>{money(s.hardActual)} / {money(s.hardBudgetLimit)}</small></div>
        <div><div className="progress-heading"><span>הוצאות משתנות</span><strong>{Math.round(variablePercent)}%</strong></div><div className={`decision-progress ${progressTone(variablePercent)}`}><div style={{ width: `${variablePercent}%` }} /></div><small>{money(s.variableActual)} / {money(s.variableBudgetLimit || s.availableVariable)}</small></div>
      </div>
    </section>

    <section className="decision-card">
      <div className="decision-card-header"><div><h2>לאן הכסף הולך?</h2><p>ראשי פרקים בלבד. פתח קטגוריה רק כשצריך לרדת לפרטים.</p></div></div>
      <div className="budget-accordion">
        {sections.length === 0 && <div className="empty-state">עדיין לא הוגדרו תקציבים לחודש הזה.</div>}
        {sections.map(([section, items]) => {
          const totalLimit = items.reduce((sum, item) => sum + item.limit, 0);
          const totalActual = items.reduce((sum, item) => sum + item.actual, 0);
          const percent = totalLimit > 0 ? Math.min(100, (totalActual / totalLimit) * 100) : 0;
          return <details className="budget-section" key={section}>
            <summary><div><strong>{section}</strong><small>{items.length} סעיפים · {money(totalActual)} מתוך {money(totalLimit)}</small></div><div className="budget-summary"><b>{Math.round(percent)}%</b><span className={`mini-progress ${progressTone(percent)}`}><i style={{ width: `${percent}%` }} /></span></div></summary>
            <div className="budget-section-body">{items.map(item => <div className="budget-item" key={item.categoryId}><div><strong>{item.name}</strong><small>{item.class === "HARD" ? "הוצאה קשיחה" : "הוצאה משתנה"} · נשארו {money(item.remaining)}</small></div><div className="budget-item-right"><b>{money(item.actual)}</b><span>{Math.round(item.percent)}%</span></div></div>)}</div>
          </details>;
        })}
      </div>
      {s.uncategorizedActual > 0 && <div className="attention-note"><strong>{money(s.uncategorizedActual)} ללא מסגרת</strong><span>כדאי לשייך את התנועות האלה כדי לשפר את תמונת התקציב.</span></div>}
    </section>

    <details className="decision-card settings-accordion">
      <summary><div><h2>הגדרות ותכנון</h2><p>הכנסות, חיסכון, קרן חירום וקופות — לא חלק מהמסך היומיומי.</p></div><span>פתיחה</span></summary>
      <div className="settings-body">
        <section className="settings-block"><h3>הכנסות</h3><div className="stack">{data.incomes.map(i => <div className="list-row" key={i.id}><div><strong>{i.name}</strong><small>{incomeLabels[i.type]}</small></div><strong>{money(i.monthlyAmount)}</strong><button className="text-button danger" onClick={() => remove(`/api/income?id=${i.id}`)}>מחיקה</button></div>)}</div><form className="inline-form" onSubmit={addIncome}><input value={income.name} onChange={e => setIncome({ ...income, name: e.target.value })} placeholder="שם ההכנסה" required /><select value={income.type} onChange={e => setIncome({ ...income, type: e.target.value as Income["type"] })}><option value="SALARY">משכורת</option><option value="BENEFIT">קצבה / הטבה</option><option value="ADDITIONAL">הכנסה נוספת</option></select><input type="number" min="1" value={income.monthlyAmount} onChange={e => setIncome({ ...income, monthlyAmount: e.target.value })} placeholder="סכום חודשי" required /><button className="primary-button">הוסף</button></form></section>
        <section className="settings-block"><h3>חיסכון וקרן חירום</h3><form className="form-grid" onSubmit={savePlan}><label>חיסכון חודשי<input type="number" min="0" value={plan.monthlySavingsTarget} onChange={e => setPlan({ ...plan, monthlySavingsTarget: e.target.value })} /></label><label>בילויים לשבוע<input type="number" min="0" value={plan.weeklyLeisureBudget} onChange={e => setPlan({ ...plan, weeklyLeisureBudget: e.target.value })} /></label><label>קרן חירום קיימת<input type="number" min="0" value={plan.emergencyFundAmount} onChange={e => setPlan({ ...plan, emergencyFundAmount: e.target.value })} /></label><label>יעד קרן חירום<select value={plan.emergencyTargetMonths} onChange={e => setPlan({ ...plan, emergencyTargetMonths: e.target.value })}><option value="3">3 חודשים</option><option value="4">4 חודשים</option><option value="5">5 חודשים</option><option value="6">6 חודשים</option></select></label><button className="primary-button" disabled={saving}>{saving ? "שומר..." : "שמור"}</button></form><div className="progress-block"><div className="progress-label"><span>קרן חירום</span><strong>{money(s.emergencyProgress)} / {money(emergencyTarget)}</strong></div><div className={`decision-progress ${progressTone(emergencyPercent)}`}><div style={{ width: `${emergencyPercent}%` }} /></div><small>טווח מומלץ: {money(s.emergencyMin)}–{money(s.emergencyMax)} לפי הוצאות החובה.</small></div></section>
        <section className="settings-block"><h3>קופות ייעודיות</h3><div className="stack">{data.funds.map(f => <div className="list-row" key={f.id}><div><strong>{f.name}</strong><small>{money(f.currentAmount)} מתוך {money(f.targetAmount)} · הפקדה {money(f.monthlyContribution)} לחודש</small></div><button className="text-button danger" onClick={() => remove(`/api/sinking-funds?id=${f.id}`)}>מחיקה</button></div>)}</div><form className="form-grid" onSubmit={addFund}><label>שם הקופה<input value={fund.name} onChange={e => setFund({ ...fund, name: e.target.value })} required /></label><label>יעד<input type="number" min="1" value={fund.targetAmount} onChange={e => setFund({ ...fund, targetAmount: e.target.value })} required /></label><label>קיים היום<input type="number" min="0" value={fund.currentAmount} onChange={e => setFund({ ...fund, currentAmount: e.target.value })} /></label><label>הפקדה חודשית<input type="number" min="0" value={fund.monthlyContribution} onChange={e => setFund({ ...fund, monthlyContribution: e.target.value })} required /></label><button className="primary-button">הוסף קופה</button></form></section>
      </div>
    </details>
  </main>;
}
