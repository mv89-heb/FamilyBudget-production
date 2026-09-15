import { z } from "zod";

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function classifyBatch(
  transactions: ClassificationTransaction[],
  categories: ClassificationCategory[],
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiClassificationError("MISSING_API_KEY", "שירות Gemini לא מוגדר בשרת", 503);
  if (!transactions.length) return [];

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
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
    "אסור ליצור קטגוריות חדשות, אסור לשנות סוג תנועה, ואסור לבצע חישובים חשבונאיים.",
    "השתמש רק בקטגוריות מהרשימה שסופקה.",
    "אם אין מספיק מידע לסיווג אמין, החזר confidence נמוך ובחר את הקטגוריה 'אחר' אם קיימת.",
    "reason צריך להסביר בקצרה איזה פרט בתיאור הוביל להצעה.",
    "rulePattern צריך להיות שם בית העסק או ביטוי יציב מתוך התיאור שניתן להשתמש בו בעתיד בכלל CONTAINS; אם אין ביטוי יציב, החזר null.",
    "החזר הצעה אחת לכל transactionId ורק עבור transactionId שהתקבל.",
    "\nקטגוריות מותרות:\n" + allowedCategories,
    "\nתנועות לסיווג:\n" + JSON.stringify(payload),
    "\nהחזר JSON בלבד בפורמט: {\"suggestions\":[{\"transactionId\":\"...\",\"categoryId\":\"...\",\"confidence\":0,\"reason\":\"...\",\"rulePattern\":null}]}",
  ].join("\n");

  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: "פעל כמסווג שמרני. לעולם אל תמציא קטגוריה או transactionId." }] },
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json",
              maxOutputTokens: 2048,
            },
          }),
          signal: AbortSignal.timeout(20_000),
        },
      );

      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt < maxAttempts) {
          await sleep(500 * 2 ** (attempt - 1));
          continue;
        }
        if (response.status === 429) throw new GeminiClassificationError("RATE_LIMIT", "Gemini עמוס כרגע. נסה שוב בעוד כמה רגעים", 429);
        throw new GeminiClassificationError("UPSTREAM", "Gemini לא זמין כרגע. נסה שוב בעוד רגע", 502);
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("") || "";
      const parsed = responseSchema.parse(extractJson(text));
      const allowed = new Set(categories.map((category) => category.id));
      const transactionIds = new Set(transactions.map((transaction) => transaction.id));

      return parsed.suggestions
        .filter((item) => allowed.has(item.categoryId) && transactionIds.has(item.transactionId))
        .map((item) => ({
          ...item,
          confidence: Math.round(item.confidence),
          rulePattern: item.rulePattern?.trim() || null,
        }));
    } catch (error) {
      if (error instanceof GeminiClassificationError) throw error;
      if (error instanceof z.ZodError) throw new GeminiClassificationError("INVALID_RESPONSE", "Gemini החזיר תשובה שלא ניתן לאמת", 502);
      if (error instanceof DOMException && error.name === "TimeoutError") {
        if (attempt < maxAttempts) {
          await sleep(500 * 2 ** (attempt - 1));
          continue;
        }
        throw new GeminiClassificationError("TIMEOUT", "פג הזמן לניתוח ב-Gemini. נסה שוב", 504);
      }
      if (attempt < maxAttempts) {
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      throw new GeminiClassificationError("UPSTREAM", "לא ניתן להשלים את הניתוח מול Gemini", 502);
    }
  }

  throw new GeminiClassificationError("UPSTREAM", "לא ניתן להשלים את הניתוח מול Gemini", 502);
}

export async function classifyTransactionsWithGemini(
  transactions: ClassificationTransaction[],
  categories: ClassificationCategory[],
) {
  const BATCH_SIZE = 10;
  const MAX_CONCURRENCY = 3;
  const batches = Array.from({ length: Math.ceil(transactions.length / BATCH_SIZE) }, (_, index) =>
    transactions.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE),
  );
  const results = [] as Awaited<ReturnType<typeof classifyBatch>>;

  for (let index = 0; index < batches.length; index += MAX_CONCURRENCY) {
    const wave = batches.slice(index, index + MAX_CONCURRENCY);
    const waveResults = await Promise.all(wave.map((batch) => classifyBatch(batch, categories)));
    results.push(...waveResults.flat());
  }

  return results;
}
