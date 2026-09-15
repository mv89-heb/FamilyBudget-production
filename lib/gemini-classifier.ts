import { z } from "zod";
import { prisma } from "@/lib/prisma";

const suggestionSchema = z.object({ transactionId: z.string().min(1), categoryId: z.string().min(1), confidence: z.number().min(0).max(100), reason: z.string().trim().min(1).max(300), rulePattern: z.string().trim().max(100).nullable().optional() });
const responseSchema = z.object({ suggestions: z.array(suggestionSchema).max(100) });
export type ClassificationTransaction = { id: string; amount: number; transactionDate: string; note: string | null };
type ClassificationCategory = { id: string; name: string };
type ClassificationRule = { id: string; pattern: string; matchType: "CONTAINS" | "EXACT" | "STARTS_WITH"; categoryId: string; priority: number; category: { name: string } };
export class GeminiClassificationError extends Error { readonly code: "MISSING_API_KEY" | "RATE_LIMIT" | "TIMEOUT" | "UPSTREAM" | "INVALID_RESPONSE"; readonly status: number; constructor(code: GeminiClassificationError["code"], message: string, status: number) { super(message); this.name = "GeminiClassificationError"; this.code = code; this.status = status; } }
const normalize = (value: string) => value.toLocaleLowerCase("he").replace(/[\u200e\u200f\u202a-\u202e]/g, "").replace(/\s+/g, " ").trim();
const matchesRule = (text: string, rule: ClassificationRule) => { const value = normalize(text), pattern = normalize(rule.pattern); if (!pattern) return false; if (rule.matchType === "EXACT") return value === pattern; if (rule.matchType === "STARTS_WITH") return value.startsWith(pattern); return value.includes(pattern); };
function deterministicCategory(note: string | null) {
  const text = normalize(note || ""), has = (...terms: string[]) => terms.some((term) => text.includes(normalize(term)));
  if (has("משיכת מזומן", "משיכה כספית", "משיכה מבאנקט", "cash withdrawal")) return { name: "משיכת מזומן", reason: "זוהתה משיכת מזומן" };
  if (has("ישראכרט", "כרטיסי אשראי", "חיוב כרטיס", "credit card payment")) return { name: "חיובי כרטיסי אשראי", reason: "זוהה חיוב כרטיס אשראי" };
  if (has("העברה/", "ב.הופועלים-ביט/", "משיכה לחשבון", "ביט/", "bank transfer", "transfer")) return { name: "העברות כספיות", reason: "זוהתה העברה כספית" };
  if (has("לאומי למשכנתאות", "משכנתא")) return { name: "דיור והתחייבויות", reason: "זוהה תשלום משכנתא" };
  if (has("בנק יהב-אשראי", "בנק יהב אשראי", "מימון ישיר", "הלוואה")) return { name: "חובות והלוואות", reason: "זוהה תשלום הלוואה" };
  if (has("הפקדה לפקדון", "הפקדה לפיקדון", "הפקדה לפקדון/", "הפקדה לפיקדון/")) return { name: "חיסכון ופקדונות", reason: "זוהתה הפקדה לפיקדון" };
  if (has("שיק", "check", "cheque")) return { name: "שיק", reason: "זוהה תשלום באמצעות שיק" };
  if (has("קיזוז מטח", "המרת מטח", "foreign exchange")) return { name: "עמלות והמרת מטבע", reason: "זוהתה תנועת מטח" };
  if (has("כלל השתלמות", "כלל השתלמות כלל")) return { name: "חיסכון ופקדונות", reason: "זוהתה הפקדה לקרן השתלמות" };
  if (has("החזר", "refund", "ביטול עסקה", "זיכוי עסקה")) return { name: "החזרים", reason: "זוהה החזר או ביטול עסקה" };
  return null;
}
const findCategory = (categories: ClassificationCategory[], name: string) => { const target = normalize(name); return categories.find((category) => normalize(category.name) === target); };
async function loadRules(userId: string) { return prisma.classificationRule.findMany({ where: { userId, active: true }, select: { id: true, pattern: true, matchType: true, categoryId: true, priority: true, category: { select: { name: true } } }, orderBy: [{ priority: "asc" }, { updatedAt: "desc" }] }) as Promise<ClassificationRule[]>; }
async function classifyBatch(transactions: ClassificationTransaction[], categories: ClassificationCategory[]) {
  const apiKey = process.env.GEMINI_API_KEY?.trim(); if (!apiKey) throw new GeminiClassificationError("MISSING_API_KEY", "שירות Gemini לא מוגדר בשרת", 503);
  const models = Array.from(new Set([process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash", "gemini-2.5-flash-lite"]));
  const allowedCategories = categories.map((c) => `${c.id}: ${c.name}`).join("\n"), payload = transactions.map((t) => ({ transactionId: t.id, amount: t.amount, date: t.transactionDate.slice(0, 10), description: t.note || "" }));
  const prompt = ["אתה מסווג תנועות פיננסיות עבור מערכת תקציב משפחתית.", "הצע רק קטגוריה קיימת מהרשימה. אל תשנה סכומים או תאריכים ואל תמציא transactionId.", "אם אין ודאות, החזר confidence נמוך.", `קטגוריות:\n${allowedCategories}`, `תנועות:\n${JSON.stringify(payload)}`, "החזר JSON בלבד: {\"suggestions\":[{\"transactionId\":\"...\",\"categoryId\":\"...\",\"confidence\":0,\"reason\":\"...\",\"rulePattern\":null}]}"] .join("\n");
  let lastError: unknown;
  for (const model of models) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, signal: controller.signal, body: JSON.stringify({ systemInstruction: { parts: [{ text: "פעל כמסווג שמרני." }] }, contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: "application/json" } }) });
      if (!response.ok) { if (response.status === 429) { lastError = new GeminiClassificationError("RATE_LIMIT", "Gemini עמוס כרגע. נסה שוב בעוד כמה רגעים", 429); continue; } if ([401, 403].includes(response.status)) throw new GeminiClassificationError("UPSTREAM", "מפתח Gemini אינו תקין או אינו מורשה", 502); lastError = new GeminiClassificationError("UPSTREAM", "Gemini לא זמין כרגע. נסה שוב בעוד רגע", 502); continue; }
      const data = await response.json(), raw = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("") || "", start = raw.indexOf("{"), end = raw.lastIndexOf("}");
      if (start < 0 || end < start) throw new GeminiClassificationError("INVALID_RESPONSE", "Gemini החזיר תשובה שלא ניתן לאמת", 502);
      const parsed = responseSchema.parse(JSON.parse(raw.slice(start, end + 1))), validCategories = new Set(categories.map((c) => c.id)), validTransactions = new Set(transactions.map((t) => t.id));
      return parsed.suggestions.filter((s) => validCategories.has(s.categoryId) && validTransactions.has(s.transactionId)).map((s) => ({ ...s, confidence: Math.round(s.confidence), rulePattern: s.rulePattern?.trim() || null }));
    } catch (error) { lastError = error instanceof GeminiClassificationError ? error : error instanceof Error && error.name === "AbortError" ? new GeminiClassificationError("TIMEOUT", "פג הזמן לניתוח ב-Gemini", 504) : new GeminiClassificationError("INVALID_RESPONSE", "Gemini החזיר תשובה שלא ניתן לאמת", 502); }
    finally { clearTimeout(timer); }
  }
  throw lastError instanceof GeminiClassificationError ? lastError : new GeminiClassificationError("UPSTREAM", "Gemini לא זמין כרגע", 502);
}
export async function classifyTransactionsWithGemini(transactions: ClassificationTransaction[], categories: ClassificationCategory[], options: { userId: string }) {
  const suggestions: Array<z.infer<typeof suggestionSchema>> = [], unresolved: ClassificationTransaction[] = [], rules = await loadRules(options.userId), categoryIds = new Set(categories.map((c) => c.id)), matchedRuleIds = new Set<string>();
  for (const transaction of transactions) {
    const deterministic = deterministicCategory(transaction.note), deterministicMatch = deterministic ? findCategory(categories, deterministic.name) : undefined;
    if (deterministic && deterministicMatch) { suggestions.push({ transactionId: transaction.id, categoryId: deterministicMatch.id, confidence: 100, reason: deterministic.reason, rulePattern: null }); continue; }
    const rule = rules.find((candidate) => categoryIds.has(candidate.categoryId) && matchesRule(transaction.note || "", candidate));
    if (rule) { matchedRuleIds.add(rule.id); suggestions.push({ transactionId: transaction.id, categoryId: rule.categoryId, confidence: 100, reason: `נמצא כלל שמור: ${rule.pattern}`, rulePattern: rule.pattern }); continue; }
    unresolved.push(transaction);
  }
  let warning: string | undefined;
  if (unresolved.length) { try { suggestions.push(...await classifyBatch(unresolved, categories)); } catch (error) { warning = error instanceof GeminiClassificationError ? error.message : "Gemini לא זמין כרגע"; } }
  if (matchedRuleIds.size) await Promise.all([...matchedRuleIds].map((id) => prisma.classificationRule.update({ where: { id }, data: { matchCount: { increment: 1 } } }).catch(() => undefined)));
  return { suggestions, warning, requested: transactions.length, resolvedLocally: transactions.length - unresolved.length };
}
