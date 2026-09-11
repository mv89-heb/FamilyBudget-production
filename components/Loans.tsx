"use client";

import { FormEvent, useEffect, useState } from "react";

type Loan = { id:string; name:string; originalAmount:number; outstandingAmount:number|null; interestRate:number|null; monthlyPayment:number|null; startDate:string|null; endDate:string|null; principalPaid:number; interestPaid:number; source:"MANUAL"|"INFERRED" };
const money=(v:number|null)=>v==null?"לא הוגדר":`${v.toLocaleString("he-IL",{maximumFractionDigits:0})} ₪`;
const progress=(loan:Loan)=>loan.originalAmount>0?Math.min(100,Math.max(0,((loan.originalAmount-(loan.outstandingAmount??loan.originalAmount))/loan.originalAmount)*100)):0;

export default function Loans(){
  const [loans,setLoans]=useState<Loan[]>([]);
  const [form,setForm]=useState({name:"",originalAmount:"",outstandingAmount:"",interestRate:"",monthlyPayment:"",startDate:"",endDate:""});
  const [error,setError]=useState("");

  async function load(){try{const r=await fetch("/api/loans",{cache:"no-store"});const b=await r.json();if(!r.ok)throw new Error(b.error||"שגיאה");setLoans(b);}catch(e){setError(e instanceof Error?e.message:"שגיאה");}}
  useEffect(()=>{load()},[]);
  async function add(e:FormEvent){e.preventDefault();setError("");try{const r=await fetch("/api/loans",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,originalAmount:Number(form.originalAmount),outstandingAmount:form.outstandingAmount?Number(form.outstandingAmount):null,interestRate:form.interestRate?Number(form.interestRate):null,monthlyPayment:form.monthlyPayment?Number(form.monthlyPayment):null,startDate:form.startDate||null,endDate:form.endDate||null})});const b=await r.json();if(!r.ok)throw new Error(b.error||"לא ניתן להוסיף");setForm({name:"",originalAmount:"",outstandingAmount:"",interestRate:"",monthlyPayment:"",startDate:"",endDate:""});await load();}catch(e){setError(e instanceof Error?e.message:"שגיאה");}}

  const totalOutstanding=loans.reduce((s,l)=>s+(l.outstandingAmount||0),0);
  const totalMonthly=loans.reduce((s,l)=>s+(l.monthlyPayment||0),0);

  return <main className="page-shell debt-page" dir="rtl">
    <div className="page-header"><div><p className="eyebrow">Debt Dashboard · התחייבויות</p><h1>הלוואות</h1><p>מסך חובות נפרד מהתקציב השוטף — הנתונים הידועים מהמערכת מוצגים גם כאשר עדיין לא הוגדרה הלוואה ידנית.</p></div></div>
    {error&&<div className="error-banner">{error}</div>}

    <section className="debt-summary">
      <article><span>החזרי הלוואות בחודש</span><strong>{money(totalMonthly)}</strong></article>
      <article><span>סך החוב שנותר</span><strong>{loans.some(l=>l.outstandingAmount!=null)?money(totalOutstanding):"לא הוגדר"}</strong></article>
    </section>

    <section className="loan-grid">
      {loans.length===0&&<div className="empty-state debt-empty"><strong>אין תנועות הלוואה מזוהות</strong><span>לא נמצאו כרגע הלוואות או התחייבויות מסווגות.</span></div>}
      {loans.map(l=>{const paid=progress(l);const inferred=l.source==="INFERRED";return <article className="loan-card" key={l.id}>
        <div className="loan-card-head"><div><span className="loan-label">גוף מלווה</span><h2>{l.name}</h2></div><span className="loan-percent">{inferred?"זוהה מתנועות":`${Math.round(paid)}% שולם`}</span></div>
        <div className="loan-main-grid"><div><small>החזר חודשי</small><strong>{money(l.monthlyPayment)}</strong></div><div><small>יתרה לסגירה</small><strong>{money(l.outstandingAmount)}</strong></div></div>
        <div className="loan-progress">
          {inferred ? <small>המערכת זיהתה התחייבות לפי סיווגי תנועות. כדי לקבל יתרה, ריבית והחזר קבועים מדויקים, אפשר להשלים את פרטי ההלוואה באזור הניהול.</small> : <><div className="progress-heading"><span>התקדמות פירעון</span><b>{Math.round(paid)}%</b></div><div className="decision-progress safe"><div style={{width:`${paid}%`}}/></div><small>{money(Math.max(0,l.originalAmount-(l.outstandingAmount??l.originalAmount)))} מתוך {money(l.originalAmount)} שולמו</small></>}
        </div>
      </article>})}
    </section>

    <details className="decision-card loan-settings">
      <summary><div><h2>ניהול הלוואות</h2><p>הוספת הלוואה ונתונים שאינם נחוצים לקבלת החלטה יומיומית.</p></div><span>פתיחה</span></summary>
      <div className="settings-body"><form className="form-grid" onSubmit={add}><label>גוף מלווה<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required placeholder="משכנתא / בנק / חברת אשראי"/></label><label>סכום מקורי<input type="number" min="1" value={form.originalAmount} onChange={e=>setForm({...form,originalAmount:e.target.value})} required/></label><label>יתרה נוכחית<input type="number" min="0" value={form.outstandingAmount} onChange={e=>setForm({...form,outstandingAmount:e.target.value})}/></label><label>ריבית %<input type="number" min="0" step="0.01" value={form.interestRate} onChange={e=>setForm({...form,interestRate:e.target.value})}/></label><label>החזר חודשי<input type="number" min="0" value={form.monthlyPayment} onChange={e=>setForm({...form,monthlyPayment:e.target.value})}/></label><label>התחלה<input type="date" value={form.startDate} onChange={e=>setForm({...form,startDate:e.target.value})}/></label><label>סיום<input type="date" value={form.endDate} onChange={e=>setForm({...form,endDate:e.target.value})}/></label><button className="primary-button">הוסף הלוואה</button></form></div>
    </details>
  </main>
}
