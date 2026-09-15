import { prisma } from "../lib/prisma";
import { analyzeTransactionFingerprints } from "../lib/financial-reconciliation";

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });

  for (const user of users) {
    const [transactions, paymentMethods] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId: user.id },
        orderBy: { transactionDate: "asc" },
        select: {
          id: true,
          transactionDate: true,
          type: true,
          amount: true,
          note: true,
          fingerprint: true,
          paymentMethodId: true,
        },
      }),
      prisma.paymentMethod.findMany({
        where: { userId: user.id },
        select: { id: true, nickname: true, institution: true },
      }),
    ]);

    const paymentMethodNames = new Map(
      paymentMethods.map((method) => [
        method.id,
        method.nickname?.trim() || method.institution?.trim() || null,
      ]),
    );

    const analysis = analyzeTransactionFingerprints(
      transactions.map((row) => ({
        id: row.id,
        date: row.transactionDate.toISOString().slice(0, 10),
        type: row.type as "INCOME" | "EXPENSE",
        amount: Number(row.amount),
        note: row.note,
        paymentMethodName: paymentMethodNames.get(row.paymentMethodId) ?? null,
        fingerprint: row.fingerprint,
      })),
      "BANK",
    );

    const safeBackfill = analysis.filter((row) => row.status === "SAFE_BACKFILL");
    const collisions = analysis.filter((row) => row.status === "COLLISION");
    const matched = analysis.filter((row) => row.status === "ALREADY_MATCHED");

    console.log(JSON.stringify({
      userId: user.id,
      email: user.email,
      totalTransactions: transactions.length,
      safeBackfill: safeBackfill.length,
      collisions: collisions.length,
      alreadyMatched: matched.length,
      collisionGroups: [...new Set(collisions.map((row) => row.fingerprint))].map((fingerprint) => ({
        fingerprint,
        ids: collisions.filter((row) => row.fingerprint === fingerprint).map((row) => row.id),
      })),
    }, null, 2));
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
