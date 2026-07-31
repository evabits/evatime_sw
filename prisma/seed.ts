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
    },
  });
  console.log("Created user:", user.email);

  const activityTypes = await Promise.all([
    prisma.activityType.upsert({ where: { name: "Ontwikkeling" }, update: {}, create: { name: "Ontwikkeling" } }),
    prisma.activityType.upsert({ where: { name: "Advies" }, update: {}, create: { name: "Advies" } }),
    prisma.activityType.upsert({ where: { name: "Projectbeheer" }, update: {}, create: { name: "Projectbeheer" } }),
    prisma.activityType.upsert({ where: { name: "Ontwerp" }, update: {}, create: { name: "Ontwerp" } }),
    prisma.activityType.upsert({ where: { name: "Support" }, update: {}, create: { name: "Support" } }),
  ]);
  console.log("Created", activityTypes.length, "activity types");

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
