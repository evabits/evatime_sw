import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { EntryMutationVerdict } from "./entry-owner";
import { prisma } from "./prisma";
import { isProjectMember } from "./project-members";

export function handleError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Validation failed", issues: error.issues }, { status: 400 });
  }
  console.error(error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

/** Vertaalt een verdict naar een response, of null als de mutatie door mag. */
export function entryMutationError(verdict: EntryMutationVerdict): NextResponse | null {
  if (verdict === "not-found") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (verdict === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (verdict === "invoiced") {
    return NextResponse.json(
      { error: "Gefactureerde registraties kunnen niet worden gewijzigd of verwijderd" },
      { status: 400 },
    );
  }
  return null;
}

/**
 * Geeft een 400-response als de eigenaar geen deelnemer is van het project,
 * en null als de opslag door mag. Een projectloze registratie (een uitgave
 * zonder project) valt buiten de regel.
 */
export async function projectMembershipError(
  projectId: string | null,
  ownerId: string,
): Promise<NextResponse | null> {
  if (!projectId) return null;
  const members = await prisma.projectMember.findMany({
    where: { projectId },
    select: { userId: true },
  });
  if (isProjectMember(members.map((m) => m.userId), ownerId)) return null;
  return NextResponse.json(
    { error: "Deze medewerker is geen deelnemer van dit project" },
    { status: 400 },
  );
}

/**
 * Geeft een 400-response als er al een project met deze naam bestaat, en null
 * als de naam vrij is.
 *
 * Hoofdletterongevoelig: "Onderhoud" en "onderhoud" zijn voor een mens dezelfde
 * naam, terwijl de @unique in de database dat onderscheid wél maakt. Die unique
 * ligt eronder als vangnet tegen twee mensen die tegelijk opslaan; deze functie
 * is de echte regel.
 *
 * Gearchiveerde projecten worden NIET uitgesloten: die bezetten hun naam, zodat
 * terugzetten nooit op een naamconflict stuit.
 *
 * exceptId sluit het project zelf uit, zodat een project bij het bewerken niet
 * met zijn eigen naam botst.
 */
export async function projectNameTakenError(
  name: string,
  exceptId?: string,
): Promise<NextResponse | null> {
  const clash = await prisma.project.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (!clash) return null;
  return NextResponse.json(
    { error: "Er bestaat al een project met deze naam" },
    { status: 400 },
  );
}

/**
 * Zoekt een tag op naam, hoofdletterongevoelig en getrimd. Geeft de BESTAANDE
 * schrijfwijze terug, niet de ingetypte — aanroepers hebben die nodig om te
 * kunnen tonen waar iets mee botst, en om te koppelen aan de tag die er al is.
 *
 * De @unique op Tag.name is hoofdlettergevoelig; deze functie is de echte regel
 * en die unique blijft eronder liggen als vangnet.
 */
export async function findTagByName(name: string): Promise<{ id: string; name: string } | null> {
  return prisma.tag.findFirst({
    where: { name: { equals: name.trim(), mode: "insensitive" } },
    select: { id: true, name: true },
  });
}
