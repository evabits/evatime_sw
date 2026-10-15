import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { serialize } from "@/lib/utils";
import { canManageRecurringBatches, canManageRecurringTemplates, isAdmin } from "@/lib/roles";
import { RecurringClient } from "@/components/recurring/recurring-client";

export default async function HerhaalprojectenPage() {
  const session = await auth();
  const role = (session?.user as any)?.role ?? "EMPLOYEE";
  // Een teamleider mag alleen batches voltooien; een sjabloonbeheerder (admin)
  // mag dat ook. Wie geen van beide mag, hoort hier niet.
  if (!canManageRecurringBatches(role)) redirect("/");
  const admin = isAdmin(role);

  const [templates, batches, customers, users] = await Promise.all([
    prisma.recurringTemplate.findMany({
      where: { archivedAt: null },
      include: {
        customer: { select: { id: true, name: true, language: true } },
        variants: { orderBy: { sortOrder: "asc" } },
      },
      orderBy: { name: "asc" },
    }),
    // Elk project met een templateId is een batch, actief of al voltooid.
    prisma.project.findMany({
      where: { templateId: { not: null } },
      include: {
        customer: { select: { id: true, name: true, language: true } },
        // Inclusief de klant van het sjabloon: dáár gaat de factuur naartoe, en
        // die kan afwijken van de klant die bij het starten op het project is
        // gezet zodra iemand het sjabloon aanpast.
        template: {
          include: {
            customer: { select: { id: true, name: true, language: true } },
            // Nodig bij het voltooien: één invulveld per variant.
            variants: { orderBy: { sortOrder: "asc" } },
          },
        },
        // Het bedrag alleen voor de admin: het gaat mee naar de browser.
        generatedInvoice: { select: { id: true, invoiceNumber: true, subtotal: admin } },
        members: { select: { userId: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Voor het klantveld in het sjabloonvenster; een teamleider ziet dit veld
    // toch niet, maar de query is goedkoop genoeg om niet apart te schermen.
    prisma.customer.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // Voor het kiezen van de deelnemers van een batch.
    prisma.user.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  // Geschreven uren per batch, voor de opbrengst per uur bij de voltooide batches.
  const uren = admin
    ? await prisma.timeEntry.groupBy({
        by: ["projectId"],
        where: { projectId: { in: batches.map((b) => b.id) } },
        _sum: { hours: true },
      })
    : [];
  const urenPerBatch = new Map(uren.map((u) => [u.projectId, Number(u._sum.hours ?? 0)]));

  return (
    <RecurringClient
      initialTemplates={serialize(templates)}
      initialBatches={serialize(batches.map((b) => ({ ...b, hours: urenPerBatch.get(b.id) ?? 0 })))}
      customers={serialize(customers)}
      users={users}
      canManageTemplates={canManageRecurringTemplates(role)}
      // Een teamleider draait het werk, de beheerder doet de facturatie. Wat er
      // aan de klant in rekening wordt gebracht hoort dus niet op zijn scherm.
      toonBedragen={admin}
    />
  );
}
