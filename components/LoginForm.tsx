"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [register, setRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setError(""); setBusy(true);
    try {
      const endpoint = register ? "/api/auth/register" : "/api/auth/login";
      const body = register ? { name, email, password } : { email, password };
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "אירעה שגיאה"); return; }
      router.replace("/dashboard"); router.refresh();
    } catch { setError("לא ניתן להתחבר כרגע"); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen flex items-center justify-center p-6"><form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl border border-gray-100">
    <div className="mb-8"><div className="text-3xl font-black">FamilyBudget</div><p className="mt-2 text-gray-500">ניהול תקציב משפחתי פשוט ומאובטח</p></div>
    {register && <label className="block mb-4"><span className="block mb-2 font-semibold">שם</span><input required maxLength={80} value={name} onChange={e=>setName(e.target.value)} className="w-full rounded-xl border p-3" /></label>}
    <label className="block mb-4"><span className="block mb-2 font-semibold">אימייל</span><input required maxLength={254} type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full rounded-xl border p-3" dir="ltr" /></label>
    <label className="block mb-5"><span className="block mb-2 font-semibold">סיסמה</span><input required minLength={register ? 10 : 8} maxLength={200} type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded-xl border p-3" dir="ltr" /></label>
    {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 text-red-700 p-3">{error}</div>}
    <button disabled={busy} className="w-full rounded-xl bg-gray-900 text-white p-3 font-bold disabled:opacity-50">{busy ? "מעבד..." : register ? "יצירת חשבון" : "כניסה"}</button>
    <button type="button" disabled={busy} onClick={()=>setRegister(!register)} className="w-full mt-3 p-2 text-sm text-gray-600">{register ? "כבר יש לי חשבון" : "יצירת חשבון חדש"}</button>
  </form></main>;
}
