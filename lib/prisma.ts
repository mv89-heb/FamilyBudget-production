import { PrismaClient } from "@prisma/client";
import { resolveClassificationRule } from "@/lib/rules-engine";

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
          const userIds: string[] = Array.from(new Set<string>(args.data.map((row: any) => row.userId).filter((value: unknown): value is string => typeof value === "string" && value.length > 0)));
          if (userIds.length !== 1) return query(args);
          const userId = userIds[0];
          const [rules, categories] = await Promise.all([
            base.classificationRule.findMany({ where: { userId, active: true }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] }),
            base.category.findMany({ where: { userId }, select: { id: true, name: true } }),
          ]);
          if (!rules.length) return query(args);
          const categoryMap = new Map(categories.map((category) => [category.id, category.name]));
          const categoryIds = new Set(categories.map((category) => category.id));
          const data = args.data.map((row: any) => {
            const rule = resolveClassificationRule(rules, [row.note, categoryMap.get(row.categoryId) ?? ""]);
            if (!rule || rule.categoryId === row.categoryId || !categoryIds.has(rule.categoryId)) return row;
            return { ...row, categoryId: rule.categoryId };
          });
          const matchedRuleIds: string[] = data.map((row: any, index: number) => {
            if (row.categoryId === args.data[index].categoryId) return null;
            return resolveClassificationRule(rules, [args.data[index].note, categoryMap.get(args.data[index].categoryId) ?? ""])?.id ?? null;
          }).filter((value: string | null): value is string => Boolean(value));
          if (matchedRuleIds.length) await base.classificationRule.updateMany({ where: { id: { in: Array.from(new Set<string>(matchedRuleIds)) } }, data: { matchCount: { increment: 1 } } });
          return query({ ...args, data });
        },
        async create({ args, query }: any) {
          if (!args.data?.userId || typeof args.data.userId !== "string") return query(args);
          const userId = args.data.userId as string;
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
