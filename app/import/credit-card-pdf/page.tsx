"use client";
import { useState } from "react";
import Link from "next/link";

type Result = { rowsImported: number; rowsUpdated: number; rowsSkipped: number; pages?: number; alreadyProcessed?: boolean; source?: string };
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_OCR_PAGES = 30;

async function readResponse(response: Response) { const text = await response.text(); const contentType = response.headers.get("content-type") ?? ""; if (!text.trim()) throw new Error(`השרת החזיר תשובה ריקה (HTTP ${response.status})`); if (!contentType.includes("application/json")) throw new Error("השרת החזיר תשובה לא צפויה."); return JSON.parse(text) as Record<string, unknown>; }

async function extractPdfTextLocally(file: File, onProgress: (message: string) => void) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data, useWorkerFetch: false });
  const pdf = await loadingTask.promise;
  if (pdf.numPages > MAX_OCR_PAGES) throw new Error(`ה-PDF מכיל ${pdf.numPages} עמודים. למען יציבות הדפדפן, ניתן לבצע OCR עד ${MAX_OCR_PAGES} עמודים בכל ייבוא.`);
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("heb+eng", 1, { logger: message => { if (typeof message?.progress === "number") onProgress(`OCR: ${Math.round(message.progress * 100)}%`); } });
  try {
    const chunks: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      onProgress(`OCR מקומי: עמוד ${pageNumber} מתוך ${pdf.numPages}`);
      const page = await pdf.getPage(pageNumber); const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas"); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) throw new Error("הדפדפן לא אפשר יצירת משטח OCR");
      await page.render({ canvasContext: context, viewport }).promise;
      const result = await worker.recognize(canvas); chunks.push(`--- PAGE ${pageNumber} ---\n${result.data.text}`);
      canvas.width = 1; canvas.height = 1; page.cleanup();
    }
    return chunks.join("\n\n");
  } finally { await worker.terminate(); }
}

export default function CreditCardPdfImportPage() {
  const [file, setFile] = useState<File | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [progress, setProgress] = useState(""), [result, setResult] = useState<Result | null>(null);
  const choose = (value: File | null) => { setError(""); setResult(null); setProgress(""); if (!value) return setFile(null); if (!/\.pdf$/i.test(value.name)) return setError("ניתן להעלות רק קובץ PDF"); if (value.size > MAX_FILE_BYTES) return setError("הקובץ גדול מדי (מקסימום 10MB)"); setFile(value); };
  const submit = async () => {
    if (!file) return;
    setBusy(true); setError(""); setResult(null); setProgress("מעלה ומחלץ טקסט…");
    try {
      const fd = new FormData(); fd.append("file", file);
      const response = await fetch("/api/import/credit-card-pdf", { method: "POST", body: fd, headers: { Accept: "application/json" }, cache: "no-store" });
      const data = await readResponse(response);
      if (response.ok) { setResult(data as unknown as Result); return; }
      if (response.status !== 422 || typeof data.error !== "string" || !data.error.includes("סרוק")) throw new Error(typeof data.error === "string" ? data.error : "הייבוא נכשל");
      setProgress("ה-PDF הוא סריקה. מבצע OCR מקומי בדפדפן — הקובץ לא נשלח לשרת לצורך OCR.");
      const ocrText = await extractPdfTextLocally(file, setProgress); if (!ocrText.trim()) throw new Error("לא הצלחנו לזהות טקסט מהסריקה.");
      setProgress("ה-OCR הסתיים. שולח לשרת רק טקסט גולמי לצורך ניקוי נוסף וניתוח Gemini…");
      const ocrResponse = await fetch("/api/import/credit-card-pdf/text", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ text: ocrText }), cache: "no-store" });
      const ocrData = await readResponse(ocrResponse); if (!ocrResponse.ok) throw new Error(typeof ocrData.error === "string" ? ocrData.error : "ייבוא ה-OCR נכשל"); setResult(ocrData as unknown as Result);
    } catch (e) { setError(e instanceof Error ? e.message : "אירעה שגיאה"); } finally { setBusy(false); setProgress(""); }
  };
  return <div className="space-y-6">
    <header className="page-header"><div><div className="eyebrow">ייבוא אשראי</div><h1 className="page-title">ייבוא פירוט אשראי מ-PDF</h1><p className="page-subtitle">PDF רגיל מחולץ מקומית בשרת ונשלח ל-Gemini רק לאחר ניקוי. PDF סרוק עובר OCR מקומי בדפדפן, כך שהתמונה עצמה לא נשלחת לשרת.</p></div><Link href="/import" className="secondary-button inline-flex items-center justify-center">חזרה לייבוא</Link></header>
    {result ? <section className="card-elevated p-6 text-center md:p-10"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-3xl text-emerald-600">✓</div><div className="eyebrow mt-5">{result.alreadyProcessed ? "הקובץ כבר עובד" : "הייבוא הושלם"}</div><h2 className="mt-2 text-2xl font-extrabold text-slate-900">{result.alreadyProcessed ? "לא נוצרו כפילויות" : "עסקאות האשראי נשמרו"}</h2><p className="mt-2 text-sm text-slate-500">{result.rowsImported} נוספו · {result.rowsUpdated} עודכנו · {result.rowsSkipped} דולגו</p><div className="mt-7 flex flex-wrap justify-center gap-3"><Link href="/credit-card-transactions" className="primary-button">צפה בעסקאות האשראי</Link><button onClick={() => { setFile(null); setResult(null); }} className="secondary-button">ייבוא נוסף</button></div></section> : <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]"><section className="card-elevated p-5 md:p-8"><div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 text-center md:p-12"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-3xl">📄</div><h2 className="mt-5 text-xl font-extrabold text-slate-900">העלה פירוט אשראי PDF</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">המערכת תזהה גם PDF רגיל וגם PDF סרוק. בסריקה, ה-OCR מתבצע בתוך הדפדפן שלך.</p><label className="primary-button mt-6 inline-flex cursor-pointer">בחירת PDF<input hidden type="file" accept="application/pdf,.pdf" onChange={e => choose(e.target.files?.[0] || null)} /></label><div className="mt-4 text-xs text-slate-400">PDF · עד 10MB · עד 30 עמודי OCR</div>{file && <div className="mx-auto mt-6 max-w-lg rounded-2xl border bg-white p-4 text-right"><b className="block truncate text-sm">{file.name}</b><span className="text-xs text-slate-500">{(file.size / 1024).toFixed(0)} KB</span></div>}{progress && <div role="status" className="mt-5 rounded-xl bg-indigo-50 p-3 text-sm font-medium text-indigo-800">{progress}</div>}{error && <div role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div>}{file && <button disabled={busy} onClick={submit} className="primary-button mt-5 w-full disabled:opacity-60">{busy ? "מחלץ ומנתח…" : "נתח והעלה"}</button>}</div></section><aside className="card-elevated p-6"><h2 className="font-bold text-slate-900">🔒 פרטיות לפני הכול</h2><div className="mt-5 space-y-3 text-sm text-slate-700"><div>✓ PDF רגיל: רק טקסט מחולץ עובר ניקוי לפני Gemini</div><div>✓ PDF סרוק: התמונה נשארת בדפדפן שלך</div><div>✓ מספרי כרטיס וחשבון מוסרים</div><div>✓ CVV וקודים מוסרים</div><div>✓ תעודת זהות, טלפון ודוא״ל מוסרים</div><div>✓ Gemini מקבל טקסט מנוקה בלבד</div><div>✓ ה-PDF המקורי לא נשמר ב-DB</div><div>✓ הייבוא מוגן מפני כפילויות</div></div><div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs leading-5 text-amber-800">בפעם הראשונה של OCR הדפדפן עשוי להוריד מנוע OCR ומודל שפה. הנתונים של ה-PDF עצמם לא נשלחים לשירות ה-OCR.</div></aside></div>}
  </div>;
}
