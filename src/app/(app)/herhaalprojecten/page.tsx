import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { serialize } from "@/lib/utils";
import { canCompleteRecurringBatch, canManageRecurringTemplates } from "@/lib/roles";
import { RecurringClient } from "@/components/recurring/recurring-client";

export default async function HerhaalprojectenPage() {
  const session = await auth();
  const role = (session?.user as any)?.role ?? "EMPLOYEE";
  // Een teamleider mag alleen batches voltooien; een sjabloonbeheerder (admin)
  // mag dat ook. Wie geen van beide mag, hoort hier niet.
  if (!canCompleteRecurringBatch(role)) redirect("/");

  const [templates, batches, customers] = await Promise.all([
    prisma.recurringTemplate.findMany({
      where: { archivedAt: null },
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    }),
    // Elk project met een templateId is een batch, actief of al voltooid.
    prisma.project.findMany({
      where: { templateId: { not: null } },
      include: {
        customer: { select: { id: true, name: true } },
        template: true,
        generatedInvoice: { select: { id: true, invoiceNumber: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Voor het klantveld in het sjabloonvenster; een teamleider ziet dit veld
    // toch niet, maar de query is goedkoop genoeg om niet apart te schermen.
    prisma.customer.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <RecurringClient
      initialTemplates={serialize(templates)}
      initialBatches={serialize(batches)}
      customers={serialize(customers)}
      canManageTemplates={canManageRecurringTemplates(role)}
    />
  );
}
