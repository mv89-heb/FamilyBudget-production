import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  originalAmount: z.coerce.number().finite().positive().max(999999999),
  outstandingAmount: z.coerce.number().finite().nonnegative().max(999999999).optional().nullable(),
  interestRate: z.coerce.number().finite().nonnegative().max(100).optional().nullable(),
  monthlyPayment: z.coerce.number().finite().nonnegative().max(999999999).optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dateOrNull(value?: string | null) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function currentJerusalemMonthRange() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const key = year && month ? `${year}-${month}` : new Date().toISOString().slice(0, 7);
  const start = new Date(`${key}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

const LIABILITY_PATTERN = /(הלווא|משכנתא|יהב[- ]אשראי|מימון ישיר|אשראי)/i;

function liabilityName(category: string, note: string | null, paymentMethod: string | null) {
  const text = [note ?? "", paymentMethod ?? "", category].join(" ");
  if (/יהב[- ]אשראי/i.test(text)) return "בנק יהב - אשראי";
  if (/מימון ישיר/i.test(text)) return "מימון ישיר";
  if (/משכנתא|לאומי למשכנתאות/i.test(text)) return "משכנתא";
  if (/אשראי/i.test(text)) return "אשראי";
  return "הלוואה";
}

export async function GET() {
  try {
    const user = await requireUser();
    const monthRange = currentJerusalemMonthRange();
    const [loans, liabilityTransactions] = await Promise.all([
      prisma.loan.findMany({
        where: { userId: user.id },
        include: { transactions: { select: { kind: true, amount: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.transaction.findMany({
        where: {
          userId: user.id,
          OR: [
            { kind: "LOAN_PRINCIPAL" },
            { kind: "LOAN_INTEREST" },
            { category: { name: { contains: "הלווא", mode: "insensitive" } } },
            { category: { name: { contains: "משכנתא", mode: "insensitive" } } },
            { category: { name: { contains: "חובות", mode: "insensitive" } } },
            { note: { contains: "יהב-אשראי", mode: "insensitive" } },
            { note: { contains: "מימון ישיר", mode: "insensitive" } },
          ],
        },
        select: { id: true, kind: true, amount: true, transactionDate: true, category: { select: { name: true } }, note: true, paymentMethod: { select: { nickname: true } } },
      }),
    ]);

    const explicit = loans.map((loan) => ({
      id: loan.id,
      name: loan.name,
      originalAmount: Number(loan.originalAmount),
      outstandingAmount: loan.outstandingAmount == null ? null : Number(loan.outstandingAmount),
      interestRate: loan.interestRate == null ? null : Number(loan.interestRate),
      monthlyPayment: loan.monthlyPayment == null ? null : Number(loan.monthlyPayment),
      startDate: loan.startDate?.toISOString().slice(0, 10) ?? null,
      endDate: loan.endDate?.toISOString().slice(0, 10) ?? null,
      principalPaid: loan.transactions.filter((t) => t.kind === "LOAN_PRINCIPAL").reduce((sum, t) => sum + Number(t.amount), 0),
      interestPaid: loan.transactions.filter((t) => t.kind === "LOAN_INTEREST").reduce((sum, t) => sum + Number(t.amount), 0),
      source: "MANUAL" as const,
    }));

    const inferredMap = new Map<string, { name: string; monthlyPayment: number; principalPaid: number; interestPaid: number }>();
    for (const tx of liabilityTransactions) {
      const text = [tx.category.name, tx.note ?? "", tx.paymentMethod?.nickname ?? ""].join(" ");
      if (!LIABILITY_PATTERN.test(text) && tx.kind !== "LOAN_PRINCIPAL" && tx.kind !== "LOAN_INTEREST") continue;
      const name = liabilityName(tx.category.name, tx.note, tx.paymentMethod?.nickname ?? null);
      const current = inferredMap.get(name) ?? { name, monthlyPayment: 0, principalPaid: 0, interestPaid: 0 };
      if (tx.kind === "LOAN_PRINCIPAL") current.principalPaid += Number(tx.amount);
      if (tx.kind === "LOAN_INTEREST") current.interestPaid += Number(tx.amount);
      if (tx.transactionDate >= monthRange.start && tx.transactionDate < monthRange.end) current.monthlyPayment += Number(tx.amount);
      inferredMap.set(name, current);
    }

    const inferred = [...inferredMap.values()].map((loan, index) => ({
      id: `inferred-${index}-${loan.name}`,
      name: loan.name,
      originalAmount: 0,
      outstandingAmount: null,
      interestRate: null,
      monthlyPayment: loan.monthlyPayment || null,
      startDate: null,
      endDate: null,
      principalPaid: loan.principalPaid,
      interestPaid: loan.interestPaid,
      source: "INFERRED" as const,
    })).filter((loan) => !explicit.some((item) => item.name === loan.name));

    return NextResponse.json([...explicit, ...inferred]);
  } catch {
    return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = schema.parse(await req.json());
    const loan = await prisma.loan.create({
      data: {
        userId: user.id,
        name: input.name,
        originalAmount: input.originalAmount,
        outstandingAmount: input.outstandingAmount ?? input.originalAmount,
        interestRate: input.interestRate ?? null,
        monthlyPayment: input.monthlyPayment ?? null,
        startDate: dateOrNull(input.startDate),
        endDate: dateOrNull(input.endDate),
      },
    });
    return NextResponse.json(loan, { status: 201 });
  } catch {
    return NextResponse.json({ error: "לא ניתן ליצור הלוואה" }, { status: 400 });
  }
}
