import { PrismaClient } from "@prisma/client";
import { buildRuleText, resolveClassificationRule } from "@/lib/rules-engine";

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createPrisma> };

function createPrisma() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    transactionOptions: { maxWait: 10_000, timeout: 120_000 },
  });

  return base.$extends({
    query: {
      transaction: {
        async createMany({ args, query }: any) {
          if (!Array.isArray(args.data) || args.data.length === 0) return query(args);
          const userIds = [...new Set(args.data.map((row: any) => row.userId).filter(Boolean))];
          if (userIds.length !== 1) return query(args);
          const userId = userIds[0];
          const [rules, categories] = await Promise.all([
            base.classificationRule.findMany({ where: { userId, active: true }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] }),
            base.category.findMany({ where: { userId }, select: { id: true, name: true } }),
          ]);
          if (!rules.length) return query(args);
          const categoryMap = new Map(categories.map((category) => [category.id, category.name]));
          const categoryById = new Map(categories.map((category) => [category.id, category]));
          const data = args.data.map((row: any) => {
            const categoryName = categoryMap.get(row.categoryId) ?? "";
            const rule = resolveClassificationRule(rules, [row.note, categoryName]);
            if (!rule || rule.categoryId === row.categoryId || !categoryById.has(rule.categoryId)) return row;
            return { ...row, categoryId: rule.categoryId };
          });
          const matched = data.filter((row: any, index: number) => row.categoryId !== args.data[index].categoryId).length;
          if (matched) {
            const matchedIds = data.map((row: any, index: number) => row.categoryId !== args.data[index].categoryId ? resolveClassificationRule(rules, [row.note, categoryMap.get(args.data[index].categoryId) ?? ""])?.id : null).filter(Boolean);
            if (matchedIds.length) await base.classificationRule.updateMany({ where: { id: { in: matchedIds as string[] } }, data: { matchCount: { increment: 1 } } });
          }
          return query({ ...args, data });
        },
        async create({ args, query }: any) {
          if (!args.data?.userId) return query(args);
          const userId = args.data.userId;
          const [rules, categories] = await Promise.all([
            base.classificationRule.findMany({ where: { userId, active: true }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] }),
            base.category.findMany({ where: { userId }, select: { id: true, name: true } }),
          ]);
          const categoryMap = new Map(categories.map((category) => [category.id, category.name]));
          const rule = resolveClassificationRule(rules, [args.data.note, categoryMap.get(args.data.categoryId) ?? ""]);
          if (!rule || rule.categoryId === args.data.categoryId || !categories.some((category) => category.id === rule.categoryId)) return query(args);
          await base.classificationRule.update({ where: { id: rule.id }, data: { matchCount: { increment: 1 } } });
          return query({ ...args, data: { ...args.data, categoryId: rule.categoryId } });
        },
      },
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
