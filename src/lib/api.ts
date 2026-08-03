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
