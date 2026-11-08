"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Download, RefreshCw, Printer, Landmark, Wallet, TrendingUp, FileText } from "lucide-react";

type Obligation = {
  id: string; name: string; type: string; outstandingAmount: number | null;
  monthlyPayment: number | null; interestRate: number | null; source: string;
  startDate?: string | null; endDate?: string | null;
};
type Report = {
  asOf: string; month: string; historyMonths: string[];
  cashFlow: { months: { month: string; income: number; operatingExpenses: number; debtPayments: number; savings: number }[];
    averages: { income: number; operatingExpenses: number; debtPayments: number; savings: number; remainingBeforeDebt: number; remainingAfterDebt: number } };
  incomeSources: { id: string; name: string; type: string; monthlyAmount: number }[];
  declaredMonthlyIncome: number; obligations: Obligation[];
  assets: { id: string; name: string; type: string; currentValue: number }[];
  standaloneLiabilities: { id: string; name: string; type: string; outstandingAmount: number; monthlyPayment: number | null; interestRate: number | null }[];
  summary: { knownOutstandingDebt: number; knownMonthlyDebtPayments: number; actualDebtToIncome: number | null; declaredDebtToIncome: number | null; totalAssets: number; totalLiabilities: number; netWorth: number; currentMonthIncome: number; currentMonthOperatingExpenses: number; currentMonthDebtPrincipal: number; currentMonthDebtInterest: number };
  missing: { declaredIncome: boolean; unknownBalances: number; unknownPayments: number; unknownRates: number; inferredLoans: number; assets: boolean };
  notes: string[];
};
const money = (value: number | null | undefined) => value == null ? "לא ידוע" : new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(value);
const percent = (value: number | null) => value == null ? "לא ניתן לחשב" : `${value.toFixed(1)}%`;
const monthLabel = (value: string) => new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(new Date(`${value}-01T12:00:00`));
const dateLabel = (value: string) => new Intl.DateTimeFormat("he-IL", { dateStyle: "long" }).format(new Date(value));

async function readResponse(response: Response) {
  const type = response.headers.get("content-type") || "";
  if (!type.includes("application/json")) throw new Error(`שגיאת שרת (${response.status})`);
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || "שגיאה בטעינת הדוח");
  return data as Report;
}

function Metric({ label, value, hint, emphasis = false }: { label: string; value: string; hint?: string; emphasis?: boolean }) {
  return <article className={`rounded-2xl border p-5 ${emphasis ? "border-indigo-200 bg-indigo-50/60" : "border-slate-200 bg-white"}`}>
    <div className="text-xs font-bold text-slate-500">{label}</div>
    <div className="mt-2 text-2xl font-black tracking-tight text-slate-900">{value}</div>
    {hint && <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p>}
  </article>;
}

export default function MortgageReport() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setReport(await readResponse(await fetch("/api/mortgage-report", { cache: "no-store", headers: { Accept: "application/json" } }))); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "שגיאה בטעינת הדוח"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <main dir="rtl" className="mortgage-report page-shell"><div className="h-32 animate-pulse rounded-2xl bg-slate-100" /><div className="mt-4 h-64 animate-pulse rounded-2xl bg-slate-100" /></main>;
  if (error || !report) return <main dir="rtl" className="mortgage-report page-shell"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700">{error || "לא ניתן לטעון את הדוח"}</div><button className="secondary-button mt-4" onClick={() => void load()}><RefreshCw size={16} className="ml-2 inline" />נסה שוב</button></main>;

  const average = report.cashFlow.averages;
  const knownObligations = report.obligations.filter((item) => item.source !== "INFERRED");
  const inferredObligations = report.obligations.filter((item) => item.source === "INFERRED");
  const qualityCount = Number(report.missing.declaredIncome) + report.missing.unknownBalances + report.missing.unknownPayments + report.missing.unknownRates + report.missing.inferredLoans + Number(report.missing.assets);

  return <main dir="rtl" className="mortgage-report page-shell">
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between print:mb-5">
      <div><div className="eyebrow"><Landmark size={14} className="ml-1" /> מסמך הכנה לפגישת מימון</div><h1>תמונת מצב פיננסית ליועץ משכנתאות</h1><p className="mt-2 text-sm text-slate-500">ריכוז הכנסות, הוצאות, התחייבויות ונכסים לצורך בחינת איחוד הלוואות.</p><p className="mt-1 text-xs text-slate-400">נכון ל-{dateLabel(report.asOf)} · נתונים מתוך FamilyBudget</p></div>
      <div className="flex flex-wrap gap-2 report-actions"><button className="primary-button" onClick={() => window.print()}><Printer size={16} className="ml-2 inline" />הדפסה / שמירה כ-PDF</button><button className="secondary-button" onClick={() => void load()}><RefreshCw size={16} className="ml-2 inline" />רענון נתונים</button></div>
    </header>

    {qualityCount > 0 && <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2 font-extrabold text-amber-900"><AlertTriangle size={18} /> נדרשת השלמת נתונים לפני הצגה סופית</div>
      <p className="mt-1 text-sm leading-6 text-amber-800">הדוח מציג רק נתונים שנשמרו או זוהו. פרטים חסרים אינם מושלמים בניחוש.</p>
      <ul className="mt-2 grid gap-1 text-xs text-amber-900 sm:grid-cols-2">
        {report.missing.declaredIncome && <li>• לא הוגדרו מקורות הכנסה חודשיים מוצהרים</li>}
        {report.missing.unknownBalances > 0 && <li>• {report.missing.unknownBalances} התחייבויות ללא יתרת סילוק ידועה</li>}
        {report.missing.unknownPayments > 0 && <li>• {report.missing.unknownPayments} התחייבויות ללא החזר חודשי מוגדר</li>}
        {report.missing.unknownRates > 0 && <li>• {report.missing.unknownRates} התחייבויות ללא שיעור ריבית</li>}
        {report.missing.inferredLoans > 0 && <li>• {report.missing.inferredLoans} הלוואות שזוהו מתנועות אך טרם אומתו ידנית</li>}
        {report.missing.assets && <li>• לא הוזנו נכסים / חסכונות</li>}
      </ul>
    </section>}

    <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="יתרת חובות ידועה" value={money(report.summary.knownOutstandingDebt)} hint="ללא יתרות שלא הוזנו או הוסקנו" emphasis />
      <Metric label="החזרים חודשיים מוגדרים" value={money(report.summary.knownMonthlyDebtPayments)} hint="רק התחייבויות עם החזר חודשי שמור" />
      <Metric label="הכנסה חודשית ממוצעת" value={money(average.income)} hint="שלושת החודשים המלאים האחרונים" />
      <Metric label="יחס החזר להכנסה בפועל" value={percent(report.summary.actualDebtToIncome)} hint="ממוצע תשלומי חוב בפועל מול הכנסה בפועל" />
    </section>

    <section className="decision-card mt-5">
      <div className="decision-card-header"><div><h2 className="flex items-center gap-2"><TrendingUp size={18} /> תזרים חודשי — ממוצע שלושת החודשים המלאים האחרונים</h2><p>החודש הנוכחי אינו נכלל בממוצע, כדי לא להטות אותו לפני סיומו.</p></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-right text-sm"><thead><tr className="border-b border-slate-200 text-xs text-slate-500"><th className="py-3">חודש</th><th>הכנסות</th><th>הוצאות שוטפות</th><th>תשלומי חוב</th><th>חיסכון</th></tr></thead><tbody>
        {report.cashFlow.months.map((row) => <tr key={row.month} className="border-b border-slate-100"><td className="py-3 font-bold">{monthLabel(row.month)}</td><td>{money(row.income)}</td><td>{money(row.operatingExpenses)}</td><td>{money(row.debtPayments)}</td><td>{money(row.savings)}</td></tr>)}
        <tr className="bg-slate-50 font-extrabold"><td className="py-3">ממוצע חודשי</td><td>{money(average.income)}</td><td>{money(average.operatingExpenses)}</td><td>{money(average.debtPayments)}</td><td>{money(average.savings)}</td></tr>
      </tbody></table></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><Metric label="יתרה לפני תשלומי חוב" value={money(average.remainingBeforeDebt)} /><Metric label="יתרה לאחר חוב וחיסכון" value={money(average.remainingAfterDebt)} /><Metric label="יחס החזר לפי הכנסה מוצהרת" value={percent(report.summary.declaredDebtToIncome)} hint="מחושב רק אם הוגדרו הכנסות והחזרים ידועים" /></div>
    </section>

    <section className="decision-card mt-5">
      <div className="decision-card-header"><div><h2 className="flex items-center gap-2"><Wallet size={18} /> פירוט התחייבויות</h2><p>הלוואות ידניות, הלוואות שזוהו בתנועות והתחייבויות נוספות — ללא כפילות בין הלוואה להתחייבות מקושרת.</p></div></div>
      {report.obligations.length === 0 ? <p className="text-sm text-slate-500">לא הוגדרו התחייבויות במערכת.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-right text-sm"><thead><tr className="border-b border-slate-200 text-xs text-slate-500"><th className="py-3">מלווה / התחייבות</th><th>סוג מקור</th><th>יתרה לסילוק</th><th>החזר חודשי</th><th>ריבית</th><th>סטטוס נתון</th></tr></thead><tbody>
        {report.obligations.map((item) => <tr key={item.id} className="border-b border-slate-100"><td className="py-3 font-bold">{item.name}</td><td>{item.source === "INFERRED" ? "זוהה מתנועות" : item.source === "LIABILITY" ? "התחייבות" : "הוזן ידנית"}</td><td>{money(item.outstandingAmount)}</td><td>{money(item.monthlyPayment)}</td><td>{item.interestRate == null ? "לא הוזנה" : `${item.interestRate}%`}</td><td>{item.source === "INFERRED" ? "דורש אימות" : item.outstandingAmount == null || item.monthlyPayment == null ? "חסר מידע" : "נתון שהוזן"}</td></tr>)}
      </tbody></table></div>}
      {inferredObligations.length > 0 && <p className="mt-3 text-xs text-amber-700">הלוואות שזוהו מתנועות אינן כוללות יתרת קרן או ריבית משוערת; יש לאמת מול דוח יתרות מהבנק / חברת המימון.</p>}
      <p className="mt-2 text-xs text-slate-500">הלוואות עם נתונים ידניים: {knownObligations.length} · הלוואות שזוהו ודורשות אימות: {inferredObligations.length}</p>
    </section>

    <section className="mt-5 grid gap-5 lg:grid-cols-2">
      <div className="decision-card mt-0"><div className="decision-card-header"><h2>נכסים וחסכונות</h2><p>ערכים כפי שהוזנו במערכת, ללא הערכת שווי חיצונית.</p></div>{report.assets.length ? <div className="space-y-2">{report.assets.map((item) => <div key={item.id} className="flex justify-between gap-3 border-b border-slate-100 py-2 text-sm"><span>{item.name}</span><strong>{money(item.currentValue)}</strong></div>)}</div> : <p className="text-sm text-slate-500">לא הוזנו נכסים.</p>}<div className="mt-4 border-t border-slate-200 pt-3 text-sm"><div className="flex justify-between"><span>סך נכסים</span><strong>{money(report.summary.totalAssets)}</strong></div></div></div>
      <div className="decision-card mt-0"><div className="decision-card-header"><h2>התחייבויות במאזן</h2><p>יתרות פעילות כפי שנשמרו במערכת.</p></div>{report.standaloneLiabilities.length ? <div className="space-y-2">{report.standaloneLiabilities.map((item) => <div key={item.id} className="flex justify-between gap-3 border-b border-slate-100 py-2 text-sm"><span>{item.name}</span><strong>{money(item.outstandingAmount)}</strong></div>)}</div> : <p className="text-sm text-slate-500">אין התחייבויות נוספות שאינן מקושרות להלוואה.</p>}<div className="mt-4 border-t border-slate-200 pt-3 text-sm"><div className="flex justify-between"><span>סך התחייבויות במאזן</span><strong>{money(report.summary.totalLiabilities)}</strong></div><div className="mt-2 flex justify-between text-base"><span>הון עצמי נטו</span><strong>{money(report.summary.netWorth)}</strong></div></div></div>
    </section>

    <section className="decision-card mt-5">
      <div className="decision-card-header"><div><h2>מקורות הכנסה מוצהרים</h2><p>הכנסות קבועות שהוגדרו בנפרד מתנועות הבנק.</p></div></div>
      {report.incomeSources.length ? <div className="space-y-2">{report.incomeSources.map((item) => <div key={item.id} className="flex justify-between gap-3 border-b border-slate-100 py-2 text-sm"><span>{item.name}</span><strong>{money(item.monthlyAmount)}</strong></div>)}<div className="flex justify-between pt-2 font-extrabold"><span>סך הכנסה מוצהרת</span><strong>{money(report.declaredMonthlyIncome)}</strong></div></div> : <p className="text-sm text-amber-700">לא הוגדרו מקורות הכנסה. מומלץ להזין שכר נטו והכנסות קבועות במסך התכנון לפני הפקת הדוח הסופי.</p>}
    </section>

    <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-600">
      <div className="mb-2 flex items-center gap-2 font-extrabold text-slate-800"><FileText size={15} /> הבהרות ליועץ</div>
      <ul className="list-disc space-y-1 pr-5">{report.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
      <p className="mt-2">המסמך הוא ריכוז מידע לצורך שיחה ראשונית ואינו אישור יתרות, דוח אשראי, אישור הכנסה או התחייבות למתן אשראי. יש לצרף אסמכתאות רשמיות מהבנקים, המעסיקים וחברות האשראי.</p>
    </section>
  </main>;
}
