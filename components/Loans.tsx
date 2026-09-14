"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, PiggyBank, Plus } from "lucide-react";
import Link from "next/link";

type Loan = { id:string; name:string; originalAmount:number; outstandingAmount:number|null; interestRate:number|null; monthlyPayment:number|null; startDate:string|null; endDate:string|null; principalPaid:number; interestPaid:number; source:"MANUAL"|"INFERRED" };
type Fund = { id:string; name:string; targetAmount:number|string; currentAmount:number|string; monthlyContribution:number|string; dueDate:string|null; active:boolean };
type Plan = { funds: Fund[] };
const money=(v:number|null|undefined)=>v==null?"לא הוגדר":`${Number(v).toLocaleString("he-IL",{maximumFractionDigits:0})} ₪`;
const progress=(loan:Loan)=>loan.originalAmount>0?Math.min(100,Math.max(0,((loan.originalAmount-(loan.outstandingAmount??loan.originalAmount))/loan.originalAmount)*100)):0;
const fundProgress=(fund:Fund)=>Number(fund.targetAmount)>0?Math.min(100,Math.max(0,(Number(fund.currentAmount)/Number(fund.targetAmount))*100)):0;

export default function Loans(){
  const [loans,setLoans]=useState<Loan[]>([]);
  const [funds,setFunds]=useState<Fund[]>([]);
  const [form,setForm]=useState({name:"",originalAmount:"",outstandingAmount:"",interestRate:"",monthlyPayment:"",startDate:"",endDate:""});
  const [error,setError]=useState("");

  async function load(){
    try{
      const [loanResponse, planResponse]=await Promise.all([fetch("/api/loans",{cache:"no-store"}),fetch("/api/financial-plan",{cache:"no-store"})]);
      const loanBody=await loanResponse.json(); if(!loanResponse.ok)throw new Error(loanBody.error||"שגיאה בטעינת התחייבויות");
      setLoans(loanBody);
      if(planResponse.ok){const plan=await planResponse.json() as Plan;setFunds((plan.funds||[]).filter(f=>f.active!==false));}
    }catch(e){setError(e instanceof Error?e.message:"שגיאה");}
  }
  useEffect(()=>{load()},[]);
  async function add(e:FormEvent){
    e.preventDefault();setError("");
    try{const r=await fetch("/api/loans",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,originalAmount:Number(form.originalAmount),outstandingAmount:form.outstandingAmount?Number(form.outstandingAmount):null,interestRate:form.interestRate?Number(form.interestRate):null,monthlyPayment:form.monthlyPayment?Number(form.monthlyPayment):null,startDate:form.startDate||null,endDate:form.endDate||null})});const b=await r.json();if(!r.ok)throw new Error(b.error||"לא ניתן להוסיף");setForm({name:"",originalAmount:"",outstandingAmount:"",interestRate:"",monthlyPayment:"",startDate:"",endDate:""});await load();}catch(e){setError(e instanceof Error?e.message:"שגיאה");}
  }
  const totalOutstanding=loans.reduce((s,l)=>s+(l.outstandingAmount||0),0);
  const totalMonthly=loans.reduce((s,l)=>s+(l.monthlyPayment||0),0);
  const totalFunds= funds.reduce((s,f)=>s+Number(f.currentAmount),0);

  return <main className="page-shell debt-page" dir="rtl">
    <div className="page-header"><div><p className="eyebrow">כסף עתידי · התחייבויות</p><h1>התחייבויות וקופות</h1><p>כל מה שלא שייך להוצאה השוטפת: חובות, משכנתא, חיסכון ייעודי וקרן חירום.</p></div></div>
    {error&&<div className="error-banner">{error}</div>}

    <section className="debt-summary">
      <article><span>תשלומי חוב בחודש</span><strong>{money(totalMonthly)}</strong></article>
      <article><span>סך החוב שנותר</span><strong>{loans.some(l=>l.outstandingAmount!=null)?money(totalOutstanding):"לא הוגדר"}</strong></article>
      <article><span>כסף שכבר נצבר בקופות</span><strong>{money(totalFunds)}</strong></article>
    </section>

    <section className="decision-card">
      <div className="decision-card-header"><div><h2>הלוואות ומשכנתא</h2><p>התחייבויות גדולות במקום אחד, בלי לערבב אותן עם הקניות היומיומיות.</p></div></div>
      <div className="loan-grid">
        {loans.length===0&&<div className="empty-state debt-empty"><strong>אין כרגע הלוואות שהוגדרו</strong><span>אפשר להוסיף התחייבות ידנית כדי לקבל מעקב מדויק.</span></div>}
        {loans.map(l=>{const paid=progress(l);const inferred=l.source==="INFERRED";return <article className="loan-card" key={l.id}>
          <div className="loan-card-head"><div><span className="loan-label">גוף מלווה</span><h2>{l.name}</h2></div><span className="loan-percent">{inferred?"זוהה מתנועות":`${Math.round(paid)}% שולם`}</span></div>
          <div className="loan-main-grid"><div><small>{inferred?"תשלום חוב שנרשם החודש":"תשלום חודשי"}</small><strong>{money(l.monthlyPayment)}</strong></div><div><small>יתרה לסגירה</small><strong>{money(l.outstandingAmount)}</strong></div></div>
          <div className="loan-progress">{inferred?<><small>המערכת זיהתה תשלומי חוב לפי התנועות. הסכום המוצג הוא התשלומים שנרשמו החודש, ולא פירוט אוטומטי של קרן וריבית.</small></>:<><div className="progress-heading"><span>התקדמות החזר החוב</span><b>{Math.round(paid)}%</b></div><div className="decision-progress safe"><div style={{width:`${paid}%`}}/></div><small>{money(Math.max(0,l.originalAmount-(l.outstandingAmount??l.originalAmount)))} מתוך {money(l.originalAmount)} כבר שולמו</small></>}</div>
        </article>})}
      </div>
    </section>

    <section className="decision-card">
      <div className="decision-card-header"><div><h2>קופות צבירה</h2><p>כסף שכבר מיועד למטרה עתידית — חגים, רכב, הוצאות גדולות וקרן חירום.</p></div><PiggyBank size={21} className="text-slate-400" /></div>
      {funds.length===0 ? <div className="empty-state">אין עדיין קופות פעילות. ניתן להגדיר אותן מתוך הגדרות התוכנית.</div> : <div className="grid gap-3 md:grid-cols-2">{funds.map(f=>{const percent=fundProgress(f);return <article key={f.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"><div className="flex items-start justify-between gap-3"><div><strong className="block text-sm text-slate-900">{f.name}</strong><span className="mt-1 block text-xs text-slate-500">נדרש {money(Number(f.targetAmount))}{f.dueDate?` · עד ${new Date(f.dueDate).toLocaleDateString("he-IL")}`:""}</span></div><b className="text-sm text-slate-800">{Math.round(percent)}%</b></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-slate-700" style={{width:`${percent}%`}}/></div><div className="mt-2 flex justify-between text-xs text-slate-500"><span>{money(Number(f.currentAmount))} נצברו</span><span>{money(Number(f.monthlyContribution))} לחודש</span></div></article>})}</div>}
    </section>

    <details className="decision-card loan-settings">
      <summary><div><h2>ניהול התחייבויות</h2><p>הוספת הלוואה ופרטים שאינם נחוצים ביום-יום.</p></div><span>פתיחה</span></summary>
      <div className="settings-body"><form className="form-grid" onSubmit={add}><label>גוף מלווה<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required placeholder="משכנתא / בנק / חברת אשראי"/></label><label>סכום מקורי<input type="number" min="1" value={form.originalAmount} onChange={e=>setForm({...form,originalAmount:e.target.value})} required/></label><label>יתרה נוכחית<input type="number" min="0" value={form.outstandingAmount} onChange={e=>setForm({...form,outstandingAmount:e.target.value})}/></label><label>ריבית %<input type="number" min="0" step="0.01" value={form.interestRate} onChange={e=>setForm({...form,interestRate:e.target.value})}/></label><label>תשלום חודשי<input type="number" min="0" value={form.monthlyPayment} onChange={e=>setForm({...form,monthlyPayment:e.target.value})}/></label><label>התחלה<input type="date" value={form.startDate} onChange={e=>setForm({...form,startDate:e.target.value})}/></label><label>סיום<input type="date" value={form.endDate} onChange={e=>setForm({...form,endDate:e.target.value})}/></label><button className="primary-button"><Plus size={16}/> הוסף הלוואה</button></form><Link href="/plan" className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-indigo-600">ניהול יעדי החיסכון והקופות <ArrowLeft size={14}/></Link></div>
    </details>
  </main>
}
