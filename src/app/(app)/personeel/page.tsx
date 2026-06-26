import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEffectiveContract } from "@/lib/contracts";
import { serializeContract, contractSelect } from "@/app/api/contracts/route";
import { PersoneelListClient } from "@/components/personeel/personeel-list-client";

export default async function PersoneelPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "ADMIN") redirect("/");

  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, contracts: { select: contractSelect } },
  });

  const today = new Date().toISOString().slice(0, 10);
  const rows = users.map((u) => {
    const contracts = u.contracts.map(serializeContract);
    const current = getEffectiveContract(contracts, today);
    return {
      id: u.id, name: u.name, email: u.email, role: u.role,
      jobTitle: current?.jobTitle ?? null,
      salaryMonthly: current?.salaryMonthly ?? null,
      contractType: current?.contractType ?? null,
      endDate: current?.endDate ?? null,
    };
  });

  return <PersoneelListClient rows={rows} />;
}
