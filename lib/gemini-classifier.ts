import { z } from "zod";
import { prisma } from "@/lib/prisma";

const suggestionSchema = z.object({
  transactionId: z.string().min(1),
  categoryId: z.string().min(1),
  confidence: z.number().min(0).max(100),
  reason: z.string().trim().min(1).max(300),
  rulePattern: z.string().trim().max(100).nullable().optional(),
});

const responseSchema = z.object({ suggestions: z.array(suggestionSchema).max(100) });

export type ClassificationTransaction = {
  id: string;
  amount: number;
  transactionDate: string;
  note: string | null;
};

type ClassificationCategory = { id: string; name: string };
type ClassificationRule = {
  id: string;
  pattern: string;
  matchType: "CONTAINS" | "EXACT" | "STARTS_WITH";
  categoryId: string;
  priority: number;
  category: { name: string };
};

export class GeminiClassificationError extends Error {
  readonly code: "MISSING_API_KEY" | "RATE_LIMIT" | "TIMEOUT" | "UPSTREAM" | "INVALID_RESPONSE";
  readonly status: number;

  constructor(code: GeminiClassificationError["code"], message: string, status: number) {
    super(message);
    this.name = "GeminiClassificationError";
    this.code = code;
    this.status = status;
  }
}

function extractJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new GeminiClassificationError("INVALID_RESPONSE", "Gemini החזיר תשובה שלא ניתן לאמת", 502);
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new GeminiClassificationError("INVALID_RESPONSE", "Gemini החזיר תשובה שלא ניתן לאמת", 502);
  }
}

function normalize(value: string) {
  return value
    .toLocaleLowerCase("he")
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesRule(text: string, rule: ClassificationRule) {
  const value = normalize(text);
  const pattern = normalize(rule.pattern);
  if (!pattern) return false;
  if (rule.matchType === "EXACT") return value === pattern;
  if (rule.matchType === "STARTS_WITH") return value.startsWith(pattern);
  return value.includes(pattern);
}

function deterministicCategory(note: string | null) {
  const text = normalize(note || "");
  const has = (...terms: string[]) => terms.some((term) => text.includes(normalize(term)));

  if (has("משיכת מזומן", "משיכה כספית", "משיכה מבאנקט", "cash withdrawal")) {
    return { name: "משיכת מזומן", reason: "זוהתה משיכת מזומן" };
  }
  if (has("ישראכרט", "כרטיסי אשראי", "חיוב כרטיס", "credit card payment")) {
    return { name: "חיובי כרטיסי אשראי", reason: "זוהה חיוב כרטיס אשראי" };
  }
  if (has("העברה/", "ב.הופועלים-ביט/", "משיכה לחשבון", "ביט/", "bank transfer", "transfer")) {
    return { name: "העברות כספיות", reason: "זוהתה העברה כספית" };
  }
  if (has("לאומי למשכנתאות", "משכנתא")) {
    return { name: "דיור והתחייבויות", reason: "זוהה תשלום משכנתא" };
  }
  if (has("בנק יהב-אשראי", "בנק יהב אשראי", "מימון ישיר", "הלוואה")) {
    return { name: "חובות והלוואות", reason: "זוהה תשלום הלוואה" };
  }
  if (has("החזר", "refund", "ביטול עסקה", "זיכוי עסקה")) {
    return { name: "החזרים", reason: "זוהה החזר או ביטול עסקה" };
  }
  return null;
}

function findCategory(categories: ClassificationCategory[], name: string) {
  const target = normalize(name);
  return categories.find((category) => normalize(category.name) === target);
}

async function loadRules(userId: string) {
  return prisma.classificationRule.findMany({
    where: { userId, active: true },
    select: {
      id: true,
      pattern: true,
      matchType: true,
      categoryId: true,
      priority: true,
      category: { select: { name: true } },
    },
    orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
  }) as Promise<ClassificationRule[]>;
}

async function classifyBatch(
  transactions: ClassificationTransaction[],
  categories: ClassificationCategory[],
) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new GeminiClassificationError("MISSING_API_KEY", "שירות Gemini לא מוגדר בשרת", 503);
  if (!transactions.length) return [];

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const allowedCategories = categories.map((category) => `${category.id}: ${category.name}`).join("\n");
  const payload = transactions.map((transaction) => ({
    transactionId: transaction.id,
    amount: transaction.amount,
    date: transaction.transactionDate.slice(0, 10),
    description: transaction.note || "",
  }));

  const prompt = [
    "אתה מסווג תנועות פיננסיות עבור מערכת תקציב משפחתית.",
    "המטרה היחידה שלך היא להציע קטגוריה קיימת לתנועות הוצאה.",
    "אסור ליצור קטגוריות חדשות, אסור לשנות סכום או תאריך, ואסור לבצע חישובים חשבונאיים.",
    "השתמש רק בקטגוריות מהרשימה שסופקה.",
    "אם אין מספיק מידע לסיווג אמין, בחר 'אחר' אם קיימת והחזר confidence נמוך.",
    "reason צריך להסביר בקצרה איזה פרט בתיאור הוביל להצעה.",
    "rulePattern צריך להיות שם בית העסק או ביטוי יציב מתוך התיאור שניתן להשתמש בו בעתיד בכלל CONTAINS; אם אין ביטוי יציב, החזר null.",
    "החזר הצעה אחת לכל transactionId ורק עבור transactionId שהתקבל.",
    "קטגוריות מותרות:\n" + allowedCategories,
    "תנועות לסיווג:\n" + JSON.stringify(payload),
    "החזר JSON בלבד בפורמט: {\"suggestions\":[{\"transactionId\":\"...\",\"categoryId\":\"...\",\"confidence\":0,\"reason\":\"...\",\"rulePattern\":null}]}",
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: "פעל כמסווג שמרני. לעולם אל תמציא קטגוריה או transactionId." }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      if (response.status === 429) throw new GeminiClassificationError("RATE_LIMIT", "Gemini עמוס כרגע. נסה שוב בעוד כמה רגעים", 429);
      if ([401, 403].includes(response.status)) throw new GeminiClassificationError("UPSTREAM", "מפתח Gemini אינו תקין או אינו מורשה", 502);
      throw new GeminiClassificationError("UPSTREAM", "Gemini לא זמין כרגע. נסה שוב בעוד רגע", 502);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("") || "";
    const parsed = responseSchema.parse(extractJson(text));
    const allowed = new Set(categories.map((category) => category.id));
    const transactionIds = new Set(transactions.map((transaction) => transaction.id));

    return parsed.suggestions
      .filter((item) => allowed.has(item.categoryId) && transactionIds.has(item.transactionId))
      .map((item) => ({ ...item, confidence: Math.round(item.confidence), rulePattern: item.rulePattern?.trim() || null }));
  } catch (error) {
    if (error instanceof GeminiClassificationError) throw error;
    if (error instanceof z.ZodError) throw new GeminiClassificationError("INVALID_RESPONSE", "Gemini החזיר תשובה שלא ניתן לאמת", 502);
    if (error instanceof Error && error.name === "AbortError") throw new GeminiClassificationError("TIMEOUT", "פג הזמן לניתוח ב-Gemini. הסיווגים המקומיים נשמרו", 504);
    throw new GeminiClassificationError("UPSTREAM", "לא ניתן להשלים את הניתוח מול Gemini", 502);
  } finally {
    clearTimeout(timeout);
  }
}

export async function classifyTransactionsWithGemini(
  transactions: ClassificationTransaction[],
  categories: ClassificationCategory[],
  options: { userId: string },
) {
  if (!transactions.length) return [];

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const rules = await loadRules(options.userId);
  const suggestions: Array<z.infer<typeof suggestionSchema>> = [];
  const unresolved: ClassificationTransaction[] = [];
  const matchedRuleIds = new Set<string>();

  for (const transaction of transactions) {
    const deterministic = deterministicCategory(transaction.note);
    const deterministicMatch = deterministic ? findCategory(categories, deterministic.name) : undefined;
    if (deterministicMatch) {
      suggestions.push({
        transactionId: transaction.id,
        categoryId: deterministicMatch.id,
        confidence: 100,
        reason: deterministic.reason,
        rulePattern: null,
      });
      continue;
    }

    const matchingRule = rules.find((rule) => rule.categoryId && categoryById.has(rule.categoryId) && matchesRule(transaction.note || "", rule));
    if (matchingRule) {
      matchedRuleIds.add(matchingRule.id);
      suggestions.push({
        transactionId: transaction.id,
        categoryId: matchingRule.categoryId,
        confidence: 100,
        reason: `נמצא כלל שמור: ${matchingRule.pattern}`,
        rulePattern: matchingRule.pattern,
      });
      continue;
    }

    unresolved.push(transaction);
  }

  let warning: string | undefined;
  if (unresolved.length) {
    try {
      const geminiSuggestions = await classifyBatch(unresolved, categories);
      suggestions.push(...geminiSuggestions);
    } catch (error) {
      warning = error instanceof GeminiClassificationError ? error.message : "Gemini לא זמין כרגע";
    }
  }

  if (matchedRuleIds.size) {
    await Promise.all([...matchedRuleIds].map((id) => prisma.classificationRule.update({
      where: { id },
      data: { matchCount: { increment: 1 } },
    }).catch(() => undefined)));
  }

  return { suggestions, warning, requested: transactions.length, resolvedLocally: transactions.length - unresolved.length };
}
