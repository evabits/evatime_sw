import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = await hash("admin123", 12);
  const user = await prisma.user.upsert({
    where: { email: "admin@evabits.com" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@evabits.com",
      password,
      role: "ADMIN",
      workLevel: "SENIOR",
    },
  });
  console.log("Created user:", user.email);

  await prisma.companySettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      name: "Evabits",
      country: "Nederland",
    },
  });
  console.log("Created company settings");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
