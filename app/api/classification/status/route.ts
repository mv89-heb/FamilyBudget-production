import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const rows = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        type: "EXPENSE",
        category: { name: { in: ["אחר", "לא סווג"] } },
      },
      select: { amount: true, transactionDate: true },
      orderBy: { transactionDate: "desc" },
      take: 5000,
    });

    const amount = rows.reduce((sum, row) => sum + Number(row.amount), 0);
    const latestDate = rows[0]?.transactionDate?.toISOString() ?? null;

    return NextResponse.json({
      needsReview: rows.length,
      amount,
      latestDate,
      hasReviewItems: rows.length > 0,
    });
  } catch (error) {
    console.error("classification status failed", error);
    return NextResponse.json({ error: "לא ניתן לטעון את מצב הסיווג" }, { status: 500 });
  }
}
