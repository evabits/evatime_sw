import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { canManageRecurringBatches } from "@/lib/roles";
import { handleError } from "@/lib/api";
import { batchTotal, completeBatchDenial, recurringInvoiceDraft } from "@/lib/recurring";
import { standaardBetalingstekst } from "@/lib/invoice-defaults";
import { vandaagInAmsterdam } from "@/lib/quote-invoice";
import { nextInvoiceNumber } from "@/lib/invoice-number";

const schema = z.object({
  deliveredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum als jjjj-mm-dd"),
  quantity: z.number().optional().nullable(),
  approved: z.number().optional().nullable(),
  rejected: z.number().optional().nullable(),
  projectCode: z.string().trim().optional().nullable(),
  // De aantallen per variant, als het sjabloon varianten heeft.
  variants: z.array(z.object({ id: z.string().min(1), quantity: z.number() })).optional(),
});

/** Sein dat de grendel dichtsloeg; alleen bedoeld om de transactie terug te draaien. */
const INGEHAALD = "batch-al-gefactureerd";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!canManageRecurringBatches(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const data = schema.parse(await req.json());

    const batch = await prisma.project.findUnique({
      where: { id },
      // De taal van de klant bepaalt de inleiding en de betalingstekst die
      // hieronder worden opgesteld; die staan straks als tekst op de factuur.
      include: {
        template: {
          include: {
            customer: { select: { language: true } },
            variants: { orderBy: { sortOrder: "asc" } },
          },
        },
      },
    });
    if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!batch.template) {
      return NextResponse.json({ error: "Dit project komt niet uit een herhaalsjabloon" }, { status: 400 });
    }

    const opgeleverd = new Date(`${data.deliveredAt}T00:00:00Z`);
    // De namen komen van het sjabloon en niet uit het verzoek: het scherm mag
    // wel zeggen hoeveel er van een variant waren, niet hoe die heet.
    const varianten = batch.template.variants.length > 0
      ? batch.template.variants.map((v) => ({
          id: v.id,
          name: v.name,
          quantity: Number(data.variants?.find((x) => x.id === v.id)?.quantity ?? 0),
        }))
      : null;
    const invoer = {
      quantity: data.quantity,
      approved: data.approved,
      rejected: data.rejected,
      variants: varianten,
    };
    // Een meegegeven code wint van wat er bij het aanmaken is ingevuld: bij het
    // voltooien is hij vaak pas bekend.
    const projectCode = data.projectCode !== undefined ? data.projectCode || null : batch.projectCode;
    const batchData = {
      id: batch.id,
      name: batch.name,
      generatedInvoiceId: batch.generatedInvoiceId,
      deliveredAt: data.deliveredAt,
      projectCode,
    };

    const weigering = completeBatchDenial(batch.template as any, batchData, invoer);
    if (weigering) return NextResponse.json({ error: weigering }, { status: 400 });

    const totaal = batchTotal(invoer, batch.template.tracksQuality);
    const afronding = {
      status: "COMPLETED" as const,
      deliveredAt: opgeleverd,
      quantity: totaal,
      approvedCount: batch.template.tracksQuality ? Number(data.approved ?? 0) : null,
      rejectedCount: batch.template.tracksQuality ? Number(data.rejected ?? 0) : null,
      projectCode,
    };
    // De telling per variant bewaren: dat is de verantwoording van de batch, en
    // bij een facturabele batch die onder de regels van de factuur. Opnieuw
    // voltooien kan niet, maar een eerdere poging kan rijen hebben achtergelaten.
    const bewaarVarianten = async (tx: Prisma.TransactionClient) => {
      if (!varianten) return;
      await tx.batchVariantQuantity.deleteMany({ where: { projectId: batch.id } });
      await tx.batchVariantQuantity.createMany({
        data: varianten.map((v) => ({ projectId: batch.id, variantId: v.id, quantity: v.quantity })),
      });
    };

    // Intern werk: afsluiten zonder factuur. De grendel is hier de status, want
    // er komt geen generatedInvoiceId om op te letten.
    if (batch.template.billing === "NONE") {
      try {
        await prisma.$transaction(async (tx) => {
          const bijgewerkt = await tx.project.updateMany({ where: { id: batch.id, status: "ACTIVE" }, data: afronding });
          if (bijgewerkt.count === 0) throw new Error(INGEHAALD);
          await bewaarVarianten(tx);
        });
      } catch (e) {
        if (e instanceof Error && e.message === INGEHAALD) {
          return NextResponse.json({ error: "Deze batch is al voltooid." }, { status: 409 });
        }
        throw e;
      }
      return NextResponse.json({ invoiceId: null, invoiceNumber: null }, { status: 201 });
    }

    // De server rekent het aantal en het bedrag zelf uit; wat de client toont is
    // een voorbeeld en geen bewijs.
    const taal = batch.template.customer?.language ?? "NL";
    const draft = recurringInvoiceDraft(batch.template as any, batchData, invoer, taal);

    // 21%, hetzelfde vaste percentage dat POST /api/invoices als standaard
    // hanteert. Er is geen instelling voor het btw-tarief: de kolom op Invoice
    // heeft @default(21) en het factuurscherm laat het per factuur aanpassen.
    const btw = 21;
    const btwBedrag = Math.round((draft.subtotal * btw) / 100 * 100) / 100;
    // issueDate en dueDate zijn @db.Date-kolommen: Prisma bewaart daar alleen de
    // datumcomponent, en die leidt hij af uit UTC. Een kale `new Date()` zou
    // tussen middernacht en 02:00 Nederlandse tijd dus de vórige dag op de
    // factuur zetten. Daarom eerst de Nederlandse kalenderdag bepalen en die
    // vastpinnen op UTC-middernacht, zoals de rest van de app het doet.
    const vandaag = vandaagInAmsterdam();
    const invoiceNumber = await nextInvoiceNumber();

    // Alles in één transactie: een halve uitvoering laat een voltooid project
    // achter zonder factuur, of een factuur die aan niets hangt.
    let factuur;
    try {
      factuur = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          invoiceNumber,
          customerId: batch.template!.customerId,
          issueDate: vandaag,
          dueDate: new Date(vandaag.getTime() + 30 * 24 * 60 * 60 * 1000),
          status: "DRAFT",
          subject: draft.subject,
          reference: draft.reference,
          intro: draft.intro,
          language: taal,
          notes: standaardBetalingstekst(taal),
          vatRate: btw,
          subtotal: draft.subtotal,
          vatAmount: btwBedrag,
          total: draft.subtotal + btwBedrag,
          lines: { create: draft.lines.map((r, i) => ({ ...r, sortOrder: i })) },
        },
      });

      // updateMany met generatedInvoiceId: null in de voorwaarde, en niet een
      // gewone update: het lezen van de batch gebeurde buiten deze transactie,
      // dus twee mensen die tegelijk op Voltooien drukken zagen allebei nog
      // "niet gefactureerd". Zonder deze grendel maakten ze allebei een factuur
      // en bleef die van de verliezer als wees in de factuurlijst achter.
      const bijgewerkt = await tx.project.updateMany({
        where: { id: batch.id, generatedInvoiceId: null },
        data: { ...afronding, generatedInvoiceId: inv.id },
      });
      if (bijgewerkt.count === 0) throw new Error(INGEHAALD);

      await bewaarVarianten(tx);

      return inv;
      });
    } catch (e) {
      // De grendel hierboven; als eigen tak zodat er een leesbare melding
      // uitkomt in plaats van "Internal server error".
      if (e instanceof Error && e.message === INGEHAALD) {
        return NextResponse.json(
          { error: "Deze batch is inmiddels door iemand anders gefactureerd." },
          { status: 409 },
        );
      }
      throw e;
    }

    return NextResponse.json({ invoiceId: factuur.id, invoiceNumber: factuur.invoiceNumber }, { status: 201 });
  } catch (e) { return handleError(e); }
}
