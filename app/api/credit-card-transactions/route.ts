import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

function monthRange(month: string) {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

const PAGE_SIZE = 100;

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const params = new URL(req.url).searchParams;
    const month = params.get("month") || new Date().toISOString().slice(0, 7);
    const page = Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1);
    const cardId = params.get("cardId") || "all";

    const dateFilter = month === "all" ? {} : (() => {
      if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("INVALID_MONTH");
      const { start, end } = monthRange(month);
      return { purchaseDate: { gte: start, lt: end } };
    })();

    const where = {
      userId: user.id,
      ...(cardId === "all" ? {} : { paymentMethodId: cardId }),
      ...dateFilter,
    };

    const rows = await prisma.creditCardTransaction.findMany({
      where,
      select: {
        id: true,
        type: true,
        kind: true,
        amount: true,
        purchaseDate: true,
        postingDate: true,
        merchant: true,
        note: true,
        reference: true,
        installmentTotal: true,
        installmentNumber: true,
        category: { select: { id: true, name: true, type: true } },
        paymentMethod: { select: { id: true, nickname: true, last4: true, type: true } },
      },
      orderBy: [{ purchaseDate: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE + 1,
    });

    const hasNextPage = rows.length > PAGE_SIZE;
    const result = hasNextPage ? rows.slice(0, PAGE_SIZE) : rows;
    const response = NextResponse.json(result);
    response.headers.set("X-Page", String(page));
    response.headers.set("X-Page-Size", String(PAGE_SIZE));
    response.headers.set("X-Has-Next-Page", String(hasNextPage));
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    if (error instanceof Error && error.message === "INVALID_MONTH") return NextResponse.json({ error: "חודש לא תקין" }, { status: 400 });
    return NextResponse.json({ error: "לא ניתן לטעון תנועות אשראי" }, { status: 400 });
  }
}
