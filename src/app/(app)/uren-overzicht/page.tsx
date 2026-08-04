import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HoursOverviewClient } from "@/components/hours-overview/hours-overview-client";
import { MyStandupNotes } from "@/components/standup/my-standup-notes";

export default async function UrenOverzichtPage() {
  const session = await auth();
  const currentUser = session?.user as any;
  const isAdmin = currentUser?.role === "ADMIN";

  // Uitsluitend de eigen notities: dit blok bestaat voor het inzagerecht van de
  // medewerker, niet om andermans notities te tonen.
  const notes = currentUser?.id
    ? await prisma.standupNote.findMany({
        where: { userId: currentUser.id },
        orderBy: { standup: { date: "desc" } },
        select: { id: true, note: true, standup: { select: { date: true } } },
      })
    : [];

  return (
    <div className="space-y-6">
      <HoursOverviewClient isAdmin={isAdmin} />
      <MyStandupNotes
        notes={notes.map((n) => ({
          id: n.id,
          note: n.note,
          date: n.standup.date.toISOString().slice(0, 10),
        }))}
      />
    </div>
  );
}
