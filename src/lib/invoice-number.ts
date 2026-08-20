import { prisma } from "@/lib/prisma";
import { nextInvoiceNumberFrom } from "@/lib/invoice-series";

/**
 * Het eerstvolgende factuurnummer van dit jaar, `2026-0009`.
 *
 * Staat hier en niet in de route die facturen aanmaakt, omdat het kopiëren van
 * een factuur hetzelfde nummer nodig heeft. Twee reeksen die uiteenlopen zouden
 * een dubbel nummer opleveren, en `invoiceNumber` is uniek.
 *
 * Haalt de nummers op en laat `nextInvoiceNumberFrom` het rekenwerk doen — die
 * kijkt naar het hoogste bestaande nummer en niet naar hoevéél facturen er
 * zijn. Tellen ging mis zodra er een factuur verwijderd was: bij vier facturen
 * genummerd 0005 tot en met 0008 wilde de telling `0005` uitgeven, dat al
 * bestond, en dan liep zowel het aanmaken als het kopiëren van een factuur vast
 * op "Deze waarde is al in gebruik".
 */
export async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const bestaande = await prisma.invoice.findMany({
    where: { invoiceNumber: { startsWith: `${year}-` } },
    select: { invoiceNumber: true },
  });
  return nextInvoiceNumberFrom(bestaande.map((f) => f.invoiceNumber), year);
}
