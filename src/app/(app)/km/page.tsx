import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { serialize } from "@/lib/utils";
import { KmEntriesClient } from "@/components/km/km-entries-client";

export default async function KmPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";

  const [projects, recentEntries] = await Promise.all([
    prisma.project.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        defaultKmRate: true,
        customer: { select: { name: true } },
      },
    }),
    prisma.kmEntry.findMany({
      where: {
        userId,
        date: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          lte: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
        },
      },
      orderBy: { date: "desc" },
      include: {
        project: { select: { name: true, customer: { select: { name: true } } } },
      },
    }),
  ]);

  return <KmEntriesClient projects={serialize(projects)} initialEntries={serialize(recentEntries)} />;
}
