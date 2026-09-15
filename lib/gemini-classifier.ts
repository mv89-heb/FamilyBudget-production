import { z } from "zod";

const suggestionSchema = z.object({
  transactionId: z.string().min(1),
  categoryId: z.string().min(1),
  confidence: z.number().min(0).max(100),
  reason: z.string().trim().min(1).max(300),
  rulePattern: z.string().trim().max(100).nullable().optional(),
});

const responseSchema = z.object({ suggestions: z.array(suggestionSchema).max(100) });

type ClassificationTransaction = {
  id: string;
  amount: number;
  transactionDate: string;
  note: string | null;
};

type ClassificationCategory = { id: string; name: string };

function extractJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Gemini לא החזיר JSON תקין");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function classifyTransactionsWithGemini(
  transactions: ClassificationTransaction[],
  categories: ClassificationCategory[],
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY לא מוגדר בשרת");
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
    "\nהחזר JSON בלבד בפורמט: {\"suggestions\":[{\"transactionId\":\"...\",\"categoryId\":\"...\",\"confidence\":0,\"reason\":\"...\",\"rulePattern\":null}]} ",
  ].join("\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "פעל כמסווג שמרני. לעולם אל תמציא קטגוריה או transactionId." }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(25_000),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gemini לא זמין כרגע (${response.status})${detail ? `: ${detail.slice(0, 180)}` : ""}`);
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
}
