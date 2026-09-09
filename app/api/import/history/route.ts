import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const imports = await prisma.importJob.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id:true, fileName:true, status:true, rowsDetected:true, rowsImported:true, rowsSkipped:true, categoriesCreated:true, paymentMethodsCreated:true, errorMessage:true, createdAt:true, completedAt:true },
    });
    return NextResponse.json({ imports });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    console.error("Import history failed", error);
    return NextResponse.json({ error: "לא ניתן לטעון היסטוריית יבואים" }, { status: 500 });
  }
}
