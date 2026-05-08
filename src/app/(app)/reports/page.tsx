import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { ReportsClient } from "@/components/reports/reports-client";

export default async function ReportsPage() {
  const session = await auth();
  const [customers, projects, users] = await Promise.all([
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.project.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, customerId: true } }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return <ReportsClient customers={customers} projects={projects} users={users} currentUserId={session?.user?.id ?? ""} />;
}
