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
    prisma.activityType.upsert({ where: { name: "Ontwikkeling" }, update: {}, create: { name: "Ontwikkeling", defaultRate: 95 } }),
    prisma.activityType.upsert({ where: { name: "Advies" }, update: {}, create: { name: "Advies", defaultRate: 120 } }),
    prisma.activityType.upsert({ where: { name: "Projectbeheer" }, update: {}, create: { name: "Projectbeheer", defaultRate: 105 } }),
    prisma.activityType.upsert({ where: { name: "Ontwerp" }, update: {}, create: { name: "Ontwerp", defaultRate: 90 } }),
    prisma.activityType.upsert({ where: { name: "Support" }, update: {}, create: { name: "Support", defaultRate: 85 } }),
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
