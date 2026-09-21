import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { canViewInvoices, canEditInvoices } from "@/lib/roles";
import { invoiceLineChanged } from "@/lib/invoice-lines";

const lineSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(1),
  quantity: z.number(),
  unitPrice: z.number(),
  lineType: z.enum(["HOURS", "KM", "OTHER", "EXPENSE"]),
});

const updateSchema = z.object({
  status: z.enum(["DRAFT", "SENT", "PAID", "CANCELLED"]).optional(),
  notes: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
  subject: z.string().optional().nullable(),
  intro: z.string().optional().nullable(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  vatRate: z.number().min(0).max(100).optional(),
  language: z.enum(["NL", "EN"]).optional(),
  // Het adresblok voor deze ene factuur. Null = volg de klantkaart. Niet
  // getrimd naar null: een lege t.a.v. is een keuze ("geen t.a.v.-regel").
  customerName: z.string().optional().nullable(),
  attention: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  customerVatNumber: z.string().optional().nullable(),
  lines: z.array(lineSchema).optional(),
  lineIdsToDelete: z.array(z.string()).optional(),
  sentAt: z.string().optional().nullable(),
  reminderSentAt: z.string().optional().nullable(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!canViewInvoices(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        lines: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        attachments: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(invoice);
  } catch (e) { return handleError(e); }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!canEditInvoices(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;

    const data = updateSchema.parse(await req.json());
    const existing = await prisma.invoice.findUnique({
      where: { id },
      select: {
        status: true,
        vatRate: true,
        // De hele regel en niet alleen het id: hieronder wordt vergeleken wat er
        // werkelijk veranderd is, zodat alleen die regels naar de database gaan.
        lines: {
          select: {
            id: true, description: true, quantity: true, unitPrice: true,
            lineType: true, sortOrder: true,
          },
        },
      },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (data.lines !== undefined && existing.status !== "DRAFT") {
      return NextResponse.json({ error: "Alleen concept facturen kunnen worden bewerkt" }, { status: 400 });
    }

    const invoice = await prisma.$transaction(async (tx) => {
      // Delete removed lines and unlink their entries
      if (data.lineIdsToDelete?.length) {
        await tx.timeEntry.updateMany({
          where: { invoiceLineId: { in: data.lineIdsToDelete } },
          data: { invoiced: false, invoiceLineId: null },
        });
        await tx.kmEntry.updateMany({
          where: { invoiceLineId: { in: data.lineIdsToDelete } },
          data: { invoiced: false, invoiceLineId: null },
        });
        // Uitgaven horen hier net zo goed bij: zonder deze stap blijft een
        // uitgave op "gefactureerd" staan nadat zijn regel van de factuur is
        // gehaald, en verdwijnt hij uit elke volgende factuurlijst zonder ooit
        // in rekening te zijn gebracht.
        await tx.expense.updateMany({
          where: { invoiceLineId: { in: data.lineIdsToDelete } },
          data: { invoiced: false, invoiceLineId: null },
        });
        await tx.invoiceLine.deleteMany({ where: { id: { in: data.lineIdsToDelete } } });
      }

      // Upsert lines
      if (data.lines) {
        const bestaand = new Map(existing.lines.map((l) => [l.id, l]));
        const nieuweRegels: any[] = [];

        // De volgorde uit het scherm is leidend. Zonder dit kreeg een regel die
        // je erbij typt sortOrder nul en sprong hij naar boven, tussen de eerste
        // regels van de factuur.
        for (const [positie, line] of data.lines.entries()) {
          const lineData = {
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            total: line.quantity * line.unitPrice,
            lineType: line.lineType,
            sortOrder: positie,
          };
          if (!line.id) {
            nieuweRegels.push({ ...lineData, invoiceId: id });
            continue;
          }
          // Ongewijzigde regels overslaan. Een factuur van vijftig regels liep
          // anders tegen de tijdslimiet van de transactie aan, ook als je maar
          // één regel had aangepast.
          const oud = bestaand.get(line.id);
          if (oud && !invoiceLineChanged(oud, line, positie)) continue;
          await tx.invoiceLine.update({ where: { id: line.id }, data: lineData });
        }

        // Alle nieuwe regels in één opdracht in plaats van één per stuk.
        if (nieuweRegels.length > 0) {
          await tx.invoiceLine.createMany({ data: nieuweRegels });
        }
      }

      // Recompute totals if lines changed
      let subtotal: number | undefined;
      let vatAmount: number | undefined;
      let total: number | undefined;
      if (data.lines !== undefined || data.lineIdsToDelete?.length) {
        const allLines = await tx.invoiceLine.findMany({ where: { invoiceId: id } });
        const vatRate = data.vatRate ?? Number(existing.vatRate);
        subtotal = allLines.reduce((s, l) => s + Number(l.total), 0);
        vatAmount = (subtotal * vatRate) / 100;
        total = subtotal + vatAmount;
      }

      return tx.invoice.update({
        where: { id },
        data: {
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.language !== undefined ? { language: data.language } : {}),
          ...(data.customerName !== undefined ? { customerName: data.customerName } : {}),
          ...(data.attention !== undefined ? { attention: data.attention } : {}),
          ...(data.address !== undefined ? { address: data.address } : {}),
          ...(data.postalCode !== undefined ? { postalCode: data.postalCode } : {}),
          ...(data.city !== undefined ? { city: data.city } : {}),
          ...(data.country !== undefined ? { country: data.country } : {}),
          ...(data.customerVatNumber !== undefined ? { customerVatNumber: data.customerVatNumber } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(data.reference !== undefined ? { reference: data.reference } : {}),
          ...(data.subject !== undefined ? { subject: data.subject } : {}),
          ...(data.intro !== undefined ? { intro: data.intro } : {}),
          ...(data.issueDate ? { issueDate: new Date(data.issueDate) } : {}),
          ...(data.dueDate ? { dueDate: new Date(data.dueDate) } : {}),
          ...(data.vatRate !== undefined ? { vatRate: data.vatRate } : {}),
          ...(subtotal !== undefined ? { subtotal, vatAmount, total } : {}),
          ...(data.sentAt !== undefined ? { sentAt: data.sentAt ? new Date(data.sentAt) : null } : {}),
          ...(data.reminderSentAt !== undefined ? { reminderSentAt: data.reminderSentAt ? new Date(data.reminderSentAt) : null } : {}),
        },
        include: { lines: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }, customer: true, attachments: { orderBy: { createdAt: "asc" } } },
      });
    }, {
      // Ruimer dan de standaard vijf seconden. Het bijwerken hierboven is nu
      // kort, maar een factuur waarop elke regel wél verandert blijft een reeks
      // opdrachten naar een database die in een andere regio kan staan.
      timeout: 20000,
      maxWait: 10000,
    });

    return NextResponse.json(invoice);
  } catch (e) { return handleError(e); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!canEditInvoices(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;

    const invoice = await prisma.invoice.findUnique({ where: { id }, select: { lines: { select: { id: true } } } });
    if (invoice) {
      const lineIds = invoice.lines.map((l) => l.id);
      await prisma.timeEntry.updateMany({ where: { invoiceLineId: { in: lineIds } }, data: { invoiced: false, invoiceLineId: null } });
      await prisma.kmEntry.updateMany({ where: { invoiceLineId: { in: lineIds } }, data: { invoiced: false, invoiceLineId: null } });
      await prisma.expense.updateMany({ where: { invoiceLineId: { in: lineIds } }, data: { invoiced: false, invoiceLineId: null } });
    }
    await prisma.invoice.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
