import { PrismaClient, TransactionType } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@familybudget.local";
  const passwordHash = await bcrypt.hash("ChangeMe123!", 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, name: "משפחה לדוגמה" },
  });

  const expenses = ["דיור", "מזון", "תחבורה", "חשבונות", "בריאות", "חינוך", "בילויים", "אחר"];
  const incomes = ["משכורת", "הכנסה נוספת", "אחר"];

  for (const name of expenses) {
    await prisma.category.upsert({
      where: { userId_name_type: { userId: user.id, name, type: TransactionType.EXPENSE } },
      update: {},
      create: { userId: user.id, name, type: TransactionType.EXPENSE },
    });
  }
  for (const name of incomes) {
    await prisma.category.upsert({
      where: { userId_name_type: { userId: user.id, name, type: TransactionType.INCOME } },
      update: {},
      create: { userId: user.id, name, type: TransactionType.INCOME },
    });
  }
  console.log("Seeded demo user:", email);
  console.log("Demo password: ChangeMe123!");
}

main().finally(() => prisma.$disconnect());
