import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { serialize } from "@/lib/utils";
import { KmTemplatesClient } from "@/components/km/km-templates-client";

export default async function KmTemplatesPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const templates = await prisma.kmTemplate.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    include: {
      project: { select: { id: true, name: true, customer: { select: { id: true, name: true } } } },
      activityType: { select: { id: true, name: true } },
    },
  });

  return <KmTemplatesClient initialTemplates={serialize(templates)} />;
}
