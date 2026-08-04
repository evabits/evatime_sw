import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/roles";
import { TagsClient } from "@/components/tags/tags-client";

export default async function TagsPage() {
  const session = await auth();
  if (!isAdmin((session?.user as any)?.role ?? "EMPLOYEE")) redirect("/");

  // Eigen query, bewust niet via GET /api/tags: die route is voor élke rol
  // bereikbaar vanwege de rapportfilters en mag geen projectlijsten prijsgeven.
  const tags = await prisma.tag.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      projects: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, archivedAt: true, customer: { select: { name: true } } },
      },
    },
  });

  return (
    <TagsClient
      initialTags={tags.map((t) => ({
        id: t.id,
        name: t.name,
        // archivedAt is een Date; als boolean doorgeven scheelt serialisatie
        // en de client heeft niets aan het tijdstip.
        projects: t.projects.map((p) => ({
          id: p.id,
          name: p.name,
          archived: p.archivedAt !== null,
          customer: p.customer,
        })),
      }))}
    />
  );
}
