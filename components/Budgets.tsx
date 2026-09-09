use client';
import {useEffect,useState} from "react";
type C={id:string;name:string;type:string}; type B={id:string;categoryId:string;categoryName:string;limit:number;spent:number;percent:number};
export default function Budgets(){
 const [month,setMonth]=useState(new Date().toISOString().slice(0,7)),[cats,setCats]=useState<C[]>([]),[budgets,setBudgets]=useState<B[]>([]),[values,setValues]=useState<Record<string,string>>({});
 async function load(){const [a,b]=await Promise.all([fetch("/api/categories"),fetch(`/api/budgets?month=${month}`)]);setCats(await a.json());setBudgets(await b.json())}
 useEffect(()=>{load()},[month]);
 const expenseCats=cats.filter(c=>c.type==="EXPENSE");
 async function save(categoryId:string){await fetch("/api/budgets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({categoryId,month,limit:values[categoryId]||0})});load();}
 return <div><div className="flex justify-between items-center mb-6"><div><h1 className="text-3xl font-black">תקציבים</h1><p className="text-gray-500">הגדרת גבולות חודשיים לפי קטגוריה</p></div><input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="border rounded-xl p-2 bg-white"/></div>
 <div className="grid md:grid-cols-2 gap-4">{expenseCats.map(c=>{const b=budgets.find(x=>x.categoryId===c.id);const val=values[c.id]??(b?.limit?.toString()||"");const p=b?.percent||0;return <div key={c.id} className="bg-white rounded-2xl border p-5"><div className="flex justify-between"><b>{c.name}</b><span className="text-sm text-gray-500">{b?`${b.spent.toLocaleString("he-IL")} / ${b.limit.toLocaleString("he-IL")} ₪`:"לא הוגדר"}</span></div><div className="h-3 bg-gray-100 rounded-full my-4 overflow-hidden"><div className={`h-full rounded-full ${p>=100?"bg-red-600":"bg-gray-900"}`} style={{width:`${p}%`}}/></div><div className="flex gap-2"><input type="number" min="0" step="0.01" value={val} onChange={e=>setValues({...values,[c.id]:e.target.value})} className="border rounded-xl p-2 flex-1" placeholder="תקציב חודשי"/><button onClick={()=>save(c.id)} className="bg-gray-900 text-white rounded-xl px-4">שמור</button></div></div>})}</div>
 </div>
}
