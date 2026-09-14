"use client";
import { useState } from "react";
import Link from "next/link";

type Result = { rowsImported: number; rowsUpdated: number; rowsSkipped: number; pages?: number; alreadyProcessed?: boolean; source?: string };
type FileState = { file: File; hash: string; duplicate: boolean; status: "חדש" | "כבר יובא" | "מייבא" | "הושלם" | "שגיאה"; message?: string; result?: Result };
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_OCR_PAGES = 30;
const sha256 = async (file: File) => { const buffer = await file.arrayBuffer(); const digest = await crypto.subtle.digest("SHA-256", buffer); return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join(""); };
async function readResponse(response: Response) { const text = await response.text(); const contentType = response.headers.get("content-type") ?? ""; if (!text.trim()) throw new Error(`השרת החזיר תשובה ריקה (HTTP ${response.status})`); if (!contentType.includes("application/json")) throw new Error("השרת החזיר תשובה לא צפויה."); return JSON.parse(text) as Record<string, unknown>; }
async function extractPdfTextLocally(file: File, onProgress: (message: string) => void) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs"); const data = new Uint8Array(await file.arrayBuffer()); const loadingTask = pdfjs.getDocument({ data, useWorkerFetch: false }); const pdf = await loadingTask.promise;
  if (pdf.numPages > MAX_OCR_PAGES) throw new Error(`ה-PDF מכיל ${pdf.numPages} עמודים. למען יציבות הדפדפן, ניתן לבצע OCR עד ${MAX_OCR_PAGES} עמודים בכל ייבוא.`);
  const { createWorker } = await import("tesseract.js"); const worker = await createWorker("heb+eng", 1, { logger: message => { if (typeof message?.progress === "number") onProgress(`OCR: ${Math.round(message.progress * 100)}%`); } });
  try { const chunks: string[] = []; for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) { onProgress(`OCR מקומי: עמוד ${pageNumber} מתוך ${pdf.numPages}`); const page = await pdf.getPage(pageNumber); const viewport = page.getViewport({ scale: 2 }); const canvas = document.createElement("canvas"); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height); const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) throw new Error("הדפדפן לא אפשר יצירת משטח OCR"); await page.render({ canvasContext: context, canvas, viewport }).promise; const result = await worker.recognize(canvas); chunks.push(`--- PAGE ${pageNumber} ---\n${result.data.text}`); canvas.width = 1; canvas.height = 1; page.cleanup(); } return chunks.join("\n\n"); } finally { await worker.terminate(); }
}

export default function CreditCardPdfImportPage() {
  const [items, setItems] = useState<FileState[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(""), [progress, setProgress] = useState("");
  const choose = async (list: FileList | null) => {
    setError(""); setProgress(""); if (!list?.length) return;
    const selected = Array.from(list);
    const invalid = selected.find(file => !/\.pdf$/i.test(file.name) || file.size > MAX_FILE_BYTES);
    if (invalid) return setError(`הקובץ "${invalid.name}" אינו PDF תקין או גדול מ-10MB.`);
    try {
      setProgress("בודק מקומית את הקבצים ומחשב טביעת אצבע לפני העלאה…");
      const prepared = await Promise.all(selected.slice(0, 50).map(async file => ({ file, hash: await sha256(file), duplicate: false, status: "חדש" as const })));
      const response = await fetch("/api/import/credit-card-pdf", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ mode: "check", hashes: prepared.map(item => item.hash) }), cache: "no-store" });
      const data = await readResponse(response); if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "לא ניתן לבדוק כפילויות");
      const known = new Map(((data.files as Array<{ hash: string }> | undefined) || []).map(item => [item.hash, true]));
      setItems(prepared.map(item => known.has(item.hash) ? { ...item, duplicate: true, status: "כבר יובא" } : item));
    } catch (e) { setError(e instanceof Error ? e.message : "לא ניתן לבדוק את הקבצים"); } finally { setProgress(""); }
  };
  const updateItem = (index: number, patch: Partial<FileState>) => setItems(current => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  const submitOne = async (item: FileState, index: number) => {
    updateItem(index, { status: "מייבא", message: undefined });
    try {
      const fd = new FormData(); fd.append("file", item.file); const response = await fetch("/api/import/credit-card-pdf", { method: "POST", body: fd, headers: { Accept: "application/json" }, cache: "no-store" }); const data = await readResponse(response);
      if (response.ok) return updateItem(index, { status: data.alreadyProcessed ? "כבר יובא" : "הושלם", duplicate: Boolean(data.alreadyProcessed), result: data as unknown as Result });
      if (response.status !== 422 || typeof data.error !== "string" || !data.error.includes("סרוק")) throw new Error(typeof data.error === "string" ? data.error : "הייבוא נכשל");
      setProgress(`מבצע OCR מקומי עבור ${item.file.name} — הקובץ עצמו לא נשלח לשרת לצורך OCR.`);
      const ocrText = await extractPdfTextLocally(item.file, setProgress); if (!ocrText.trim()) throw new Error("לא הצלחנו לזהות טקסט מהסריקה.");
      const ocrResponse = await fetch("/api/import/credit-card-pdf/text", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ text: ocrText }), cache: "no-store" }); const ocrData = await readResponse(ocrResponse); if (!ocrResponse.ok) throw new Error(typeof ocrData.error === "string" ? ocrData.error : "ייבוא ה-OCR נכשל");
      updateItem(index, { status: ocrData.alreadyProcessed ? "כבר יובא" : "הושלם", duplicate: Boolean(ocrData.alreadyProcessed), result: ocrData as unknown as Result });
    } catch (e) { updateItem(index, { status: "שגיאה", message: e instanceof Error ? e.message : "אירעה שגיאה" }); }
  };
  const submitAll = async () => { if (busy) return; setBusy(true); setError(""); setProgress(""); try { for (let index = 0; index < items.length; index++) { const item = items[index]; if (item.duplicate || item.status === "הושלם") continue; await submitOne(item, index); } } finally { setBusy(false); setProgress(""); } };
  const newCount = items.filter(item => !item.duplicate && item.status !== "הושלם").length; const duplicateCount = items.filter(item => item.duplicate).length;
  return <div className="space-y-6">
    <header className="page-header"><div><div className="eyebrow">ייבוא אשראי</div><h1 className="page-title">ייבוא פירוטי אשראי מ-PDF</h1><p className="page-subtitle">אפשר לבחור כמה קבצים יחד. לפני העלאה המערכת מחשבת טביעת אצבע מקומית ובודקת אילו קבצים כבר יובאו, כדי שלא תעלה שוב את אותו מסמך בטעות.</p></div><Link href="/import" className="secondary-button inline-flex items-center justify-center">חזרה למסך הייבוא</Link></header>
    <section className="card-elevated p-5 md:p-8"><div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 text-center md:p-12"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-3xl">📄</div><h2 className="mt-5 text-xl font-extrabold text-slate-900">בחירת פירוטי אשראי</h2><p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">בחר קובץ PDF אחד או כמה קבצי PDF בבת אחת. ניתן לבחור עד 50 קבצים, עד 10MB לכל קובץ.</p><label className="primary-button mt-6 inline-flex cursor-pointer">בחירת קבצי PDF<input hidden type="file" multiple accept="application/pdf,.pdf" onChange={e => void choose(e.target.files)} /></label><div className="mt-4 text-xs text-slate-400">PDF · עד 10MB לקובץ · עד 30 עמודי OCR לקובץ</div></div></section>
    {progress && <div role="status" className="rounded-xl bg-indigo-50 p-3 text-sm font-medium text-indigo-800">{progress}</div>}
    {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}
    {items.length > 0 && <section className="card-elevated overflow-hidden"><div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4 md:flex-row md:items-center md:justify-between"><div><h2 className="font-bold text-slate-900">בדיקת קבצים לפני ייבוא</h2><p className="mt-1 text-xs text-slate-500">{items.length} קבצים · {duplicateCount} כבר יובאו · {newCount} ממתינים לייבוא</p></div><button disabled={busy || newCount === 0} onClick={() => void submitAll()} className="primary-button disabled:opacity-50">{busy ? "מייבא קבצים…" : `ייבוא ${newCount} קבצים חדשים`}</button></div><div className="divide-y divide-slate-100">{items.map((item, index) => <div key={`${item.hash}-${index}`} className="flex flex-col gap-2 px-5 py-4 md:flex-row md:items-center md:justify-between"><div className="min-w-0"><div className="truncate font-semibold text-slate-900">{item.file.name}</div><div className="mt-1 text-xs text-slate-500">{(item.file.size / 1024).toFixed(0)} KB · {item.status === "כבר יובא" ? "המסמך כבר יובא בעבר — לא יועלה שוב" : item.status === "הושלם" ? `${item.result?.rowsImported || 0} נוספו · ${item.result?.rowsUpdated || 0} עודכנו` : item.message || "חדש — מוכן לייבוא"}</div></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${item.status === "כבר יובא" ? "bg-amber-50 text-amber-700" : item.status === "שגיאה" ? "bg-red-50 text-red-700" : item.status === "הושלם" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>{item.status}</span></div>)}</div></section>}
    <aside className="card-elevated p-6"><h2 className="font-bold text-slate-900">🔒 פרטיות וכפילויות</h2><div className="mt-5 space-y-3 text-sm text-slate-700"><div>✓ לפני העלאה נשלחת לשרת רק טביעת SHA-256 של כל קובץ לצורך בדיקת כפילות</div><div>✓ PDF רגיל: רק טקסט מחולץ עובר ניקוי לפני Gemini</div><div>✓ PDF סרוק: התמונה נשארת בדפדפן שלך וה-OCR מתבצע מקומית</div><div>✓ מספרי כרטיס וחשבון, CVV, תעודת זהות, טלפון ודוא״ל מוסרים לפני Gemini</div><div>✓ ה-PDF המקורי לא נשמר ב-DB</div><div>✓ גם לאחר הבדיקה המקדימה, השרת בודק שוב את טביעת הקובץ לפני עיבוד — הגנה כפולה מפני כפילויות</div><div>✓ תנועות שכבר קיימות לפי טביעת העסקה מתעדכנות במקום ליצור כפילות</div></div><div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs leading-5 text-amber-800">הבדיקה המקדימה לא שולחת את תוכן הקבצים לשרת. רק לאחר שאתה לוחץ על ייבוא, הקבצים החדשים נשלחים לעיבוד.</div></aside>
  </div>;
}
