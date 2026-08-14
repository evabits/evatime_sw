import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { canViewInvoices, canEditInvoices } from "@/lib/roles";

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().positive(),
  lineType: z.enum(["HOURS", "KM", "OTHER", "EXPENSE"]),
  timeEntryIds: z.array(z.string()).optional(),
  kmEntryIds: z.array(z.string()).optional(),
  expenseIds: z.array(z.string()).optional(),
});

const schema = z.object({
  customerId: z.string().min(1),
  issueDate: z.string(),
  dueDate: z.string(),
  vatRate: z.number().min(0).max(100).default(21),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1),
});

async function getNextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.invoice.count({
    where: { invoiceNumber: { startsWith: `${year}-` } },
  });
  return `${year}-${String(count + 1).padStart(4, "0")}`;
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any)?.role ?? "EMPLOYEE";
  if (!canViewInvoices(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const invoices = await prisma.invoice.findMany({
    orderBy: { issueDate: "desc" },
    include: { customer: { select: { name: true } } },
    ...(role === "FINANCE" ? { where: { status: { in: ["SENT", "PAID"] } } } : {}),
  });
  return NextResponse.json(invoices);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any)?.role ?? "EMPLOYEE";
  if (!canEditInvoices(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const data = schema.parse(body);

  // Een verlofregel mag nooit op een factuur belanden. Het client-side filter
  // in new-invoice-client.tsx is de enige andere plek die dit tegenhoudt, dus
  // dezelfde alles-of-niets-controle als de bulkactie (entries/bulk/route.ts).
  const timeEntryIds = data.lines.flatMap((l) => l.timeEntryIds ?? []);
  const kmEntryIds = data.lines.flatMap((l) => l.kmEntryIds ?? []);
  const expenseIds = data.lines.flatMap((l) => l.expenseIds ?? []);

  if (timeEntryIds.length > 0) {
    const verlof = await prisma.timeEntry.count({
      where: { id: { in: timeEntryIds }, absenceRequestId: { not: null } },
    });
    if (verlof > 0) {
      return NextResponse.json({ error: "Verlofregels kun je niet factureren" }, { status: 400 });
    }
  }

  // Registraties van een ándere klant mogen hier niet op belanden. Het scherm
  // laat je van klant wisselen met de al toegevoegde regels nog in beeld, en
  // dan zou een factuur voor klant B de uren van klant A bevatten — en die uren
  // ook nog als gefactureerd wegschrijven, waarmee ze bij hun eigen klant uit
  // beeld verdwijnen. Het scherm waarschuwt inmiddels, maar dit is de grendel
  // die er niet omheen kan.
  //
  // Alleen aantoonbare tegenspraak weigert hij. Een registratie op een project
  // zonder klant — Project.customerId mag null zijn — hoort bij niemand en valt
  // er dus buiten, net als een uitgave zonder project. Dat is geen gat maar de
  // bedoeling: die zet een beheerder er bewust op.
  const [vreemdeUren, vreemdeKm, vreemdeUitgaven] = await Promise.all([
    timeEntryIds.length > 0
      ? prisma.timeEntry.count({
          where: { id: { in: timeEntryIds }, project: { customerId: { not: data.customerId } } },
        })
      : Promise.resolve(0),
    kmEntryIds.length > 0
      ? prisma.kmEntry.count({
          where: { id: { in: kmEntryIds }, project: { customerId: { not: data.customerId } } },
        })
      : Promise.resolve(0),
    expenseIds.length > 0
      ? prisma.expense.count({
          where: { id: { in: expenseIds }, project: { customerId: { not: data.customerId } } },
        })
      : Promise.resolve(0),
  ]);
  if (vreemdeUren + vreemdeKm + vreemdeUitgaven > 0) {
    return NextResponse.json(
      { error: "Sommige registraties horen bij een andere klant" },
      { status: 400 },
    );
  }

  const subtotal = data.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const vatAmount = (subtotal * data.vatRate) / 100;
  const total = subtotal + vatAmount;
  const invoiceNumber = await getNextInvoiceNumber();

  const invoice = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.create({
      data: {
        invoiceNumber,
        customerId: data.customerId,
        issueDate: new Date(data.issueDate),
        dueDate: new Date(data.dueDate),
        vatRate: data.vatRate,
        vatAmount,
        subtotal,
        total,
        notes: data.notes,
      },
    });

    // Regel voor regel aanmaken en de registraties meteen aan het id koppelen
    // dat we terugkrijgen. Ze in één keer aanmaken en daarna terugzoeken op
    // omschrijving en type ging mis zodra twee regels daarin gelijk waren —
    // en dat gebeurt gewoon: twee keer "Reiskosten" toevoegen levert twee
    // identieke omschrijvingen op. Alle registraties belandden dan onder de
    // eerste regel, waarna het verwijderen van de tweede zijn bedrag van de
    // factuur haalde terwijl die uren op "gefactureerd" bleven staan. Ze waren
    // daarmee uit elke volgende factuurlijst verdwenen zonder ooit in rekening
    // te zijn gebracht.
    for (const line of data.lines) {
      const createdLine = await tx.invoiceLine.create({
        data: {
          invoiceId: inv.id,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          total: line.quantity * line.unitPrice,
          lineType: line.lineType,
        },
      });

      if (line.timeEntryIds?.length) {
        await tx.timeEntry.updateMany({
          where: { id: { in: line.timeEntryIds } },
          data: { invoiced: true, invoiceLineId: createdLine.id },
        });
      }
      if (line.kmEntryIds?.length) {
        await tx.kmEntry.updateMany({
          where: { id: { in: line.kmEntryIds } },
          data: { invoiced: true, invoiceLineId: createdLine.id },
        });
      }
      if (line.expenseIds?.length) {
        await tx.expense.updateMany({
          where: { id: { in: line.expenseIds } },
          data: { invoiced: true, invoiceLineId: createdLine.id },
        });
      }
    }

    // Opnieuw ophalen zodat het antwoord de regels bevat, zoals voorheen.
    // Zonder vaste volgorde, net als hiervoor: createdAt krijgt in Postgres de
    // starttijd van de transactie, dus alle regels van één factuur delen die
    // waarde en sorteren erop zegt niets.
    return tx.invoice.findUniqueOrThrow({
      where: { id: inv.id },
      include: { lines: true },
    });
  });

  return NextResponse.json(invoice, { status: 201 });
}
