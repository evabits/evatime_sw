import { prisma } from "@/lib/prisma";

/**
 * Het eerstvolgende factuurnummer van dit jaar, `2026-0007`.
 *
 * Staat hier en niet in de route die facturen aanmaakt, omdat het kopiëren van
 * een factuur hetzelfde nummer nodig heeft. Twee tellingen die uiteenlopen
 * zouden een dubbel nummer opleveren, en `invoiceNumber` is uniek.
 */
export async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.invoice.count({
    where: { invoiceNumber: { startsWith: `${year}-` } },
  });
  return `${year}-${String(count + 1).padStart(4, "0")}`;
}
