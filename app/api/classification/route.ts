import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { classifyTransactionsWithGemini } from "@/lib/gemini-classifier";

const MAX_CLASSIFICATION_BATCH = 100;
const suggestSchema = z.object({ transactionIds: z.array(z.string().min(1)).min(1).max(MAX_CLASSIFICATION_BATCH) });
const applySchema = z.object({
  suggestions: z.array(z.object({
    transactionId: z.string().min(1),
    categoryId: z.string().min(1),
    confidence: z.number().min(0).max(100),
    reason: z.string().max(300).optional(),
    rulePattern: z.string().trim().max(100).nullable().optional(),
    rememberRule: z.boolean().default(false),
  })).min(1).max(MAX_CLASSIFICATION_BATCH),
});

const unknownNames = new Set(["אחר", "לא סווג"]);

export async function GET() {
  try {
    const user = await requireUser();
    const [transactions, categories] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId: user.id, type: "EXPENSE", category: { name: { in: [...unknownNames] } } },
        select: { id: true, amount: true, transactionDate: true, note: true, categoryId: true, category: { select: { name: true } } },
        orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
        take: MAX_CLASSIFICATION_BATCH,
      }),
      prisma.category.findMany({ where: { userId: user.id, type: "EXPENSE", name: { notIn: [...unknownNames] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return NextResponse.json({
      transactions: transactions.map((row) => ({ id: row.id, amount: Number(row.amount), transactionDate: row.transactionDate.toISOString(), note: row.note, categoryName: row.category.name })),
      categories,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    return NextResponse.json({ error: "לא ניתן לטעון תנועות לסיווג" }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const action = body?.action;

    if (action === "suggest") {
      const input = suggestSchema.parse(body);
      const [transactions, categories] = await Promise.all([
        prisma.transaction.findMany({
          where: { id: { in: input.transactionIds }, userId: user.id, type: "EXPENSE", category: { name: { in: [...unknownNames] } } },
          select: { id: true, amount: true, transactionDate: true, note: true },
        }),
        prisma.category.findMany({ where: { userId: user.id, type: "EXPENSE", name: { notIn: [...unknownNames] } }, select: { id: true, name: true } }),
      ]);
      const suggestions = await classifyTransactionsWithGemini(
        transactions.map((row) => ({ id: row.id, amount: Number(row.amount), transactionDate: row.transactionDate.toISOString(), note: row.note })),
        categories,
      );
      return NextResponse.json({ suggestions, classified: suggestions.length, requested: transactions.length });
    }

    if (action === "apply") {
      const input = applySchema.parse(body);
      const ids = input.suggestions.map((item) => item.transactionId);
      const categoryIds = input.suggestions.map((item) => item.categoryId);
      const [transactions, categories] = await Promise.all([
        prisma.transaction.findMany({ where: { id: { in: ids }, userId: user.id, type: "EXPENSE", category: { name: { in: [...unknownNames] } } }, select: { id: true, note: true } }),
        prisma.category.findMany({ where: { id: { in: categoryIds }, userId: user.id, type: "EXPENSE" }, select: { id: true, name: true } }),
      ]);
      const validTransactions = new Set(transactions.map((row) => row.id));
      const validCategories = new Set(categories.map((row) => row.id));
      const accepted = input.suggestions.filter((item) => validTransactions.has(item.transactionId) && validCategories.has(item.categoryId));
      if (!accepted.length) return NextResponse.json({ error: "אין הצעות תקינות לאישור" }, { status: 400 });

      const result = await prisma.$transaction(async (tx) => {
        let updated = 0;
        let rulesCreated = 0;
        for (const item of accepted) {
          await tx.transaction.update({ where: { id: item.transactionId }, data: { categoryId: item.categoryId } });
          updated += 1;
          if (item.rememberRule && item.rulePattern && item.rulePattern.length >= 2) {
            const pattern = item.rulePattern.trim();
            await tx.classificationRule.upsert({
              where: { userId_pattern_matchType_categoryId: { userId: user.id, pattern, matchType: "CONTAINS", categoryId: item.categoryId } },
              create: { userId: user.id, pattern, matchType: "CONTAINS", categoryId: item.categoryId, source: "GEMINI", priority: 50, active: true },
              update: { active: true, source: "GEMINI", priority: 50 },
            });
            rulesCreated += 1;
          }
        }
        return { updated, rulesCreated };
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "פעולה לא מוכרת" }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "ניתן לנתח ולאשר עד 100 תנועות בכל פעולה" }, { status: 400 });
    const message = error instanceof Error ? error.message : "לא ניתן לבצע את הפעולה";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
