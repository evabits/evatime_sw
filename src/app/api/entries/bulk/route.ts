import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";
import { isProjectMember } from "@/lib/project-members";
import { buildBulkWhere, buildBulkData } from "@/lib/bulk-entries";

const schema = z.object({
  kind: z.enum(["time", "km", "expense"]),
  ids: z.array(z.string().min(1)).min(1).max(500),
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("project"), projectId: z.string().min(1) }),
    z.object({ type: z.literal("user"), userId: z.string().min(1) }),
    z.object({ type: z.literal("delete") }),
  ]),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { kind, ids, action } = schema.parse(await req.json());

    const model =
      kind === "time" ? prisma.timeEntry : kind === "km" ? prisma.kmEntry : prisma.expense;

    // Alleen tijdregels kunnen verlofregels zijn. Bevat de selectie er één, dan
    // wordt de hele actie geweigerd — dezelfde alles-of-niets-vorm als de
    // deelnemerscontrole verderop, en om dezelfde reden: gedeeltelijk toepassen
    // met een melding die "gefactureerd" als oorzaak noemt zou misleiden.
    if (kind === "time") {
      const verlof = await prisma.timeEntry.count({
        where: { ...buildBulkWhere(ids), absenceRequestId: { not: null } },
      });
      if (verlof > 0) {
        return NextResponse.json(
          { error: "Verlofregels wijzig je via de afwezigheidsaanvraag" },
          { status: 400 },
        );
      }
    }

    if (action.type === "project") {
      const project = await prisma.project.findUnique({ where: { id: action.projectId }, select: { id: true } });
      if (!project) return NextResponse.json({ error: "Onbekend project" }, { status: 400 });

      const members = await prisma.projectMember.findMany({
        where: { projectId: action.projectId },
        select: { userId: true },
      });
      const memberIds = members.map((m) => m.userId);
      const rows = await (model as any).findMany({
        where: buildBulkWhere(ids),
        select: { userId: true },
      });
      const buiten = rows.filter((r: any) => !isProjectMember(memberIds, r.userId)).length;
      if (buiten > 0) {
        return NextResponse.json(
          { error: `${buiten} van de ${rows.length} regels heeft een eigenaar die geen deelnemer is van dit project` },
          { status: 400 },
        );
      }
    }
    let targetUser: { id: string; workLevel: string | null } | null = null;
    if (action.type === "user") {
      targetUser = await prisma.user.findUnique({ where: { id: action.userId }, select: { id: true, workLevel: true } });
      if (!targetUser) return NextResponse.json({ error: "Onbekende medewerker" }, { status: 400 });

      const rows = await (model as any).findMany({
        where: buildBulkWhere(ids),
        select: { projectId: true },
      });
      const projectIds = [...new Set(rows.map((r: any) => r.projectId).filter(Boolean))] as string[];
      const memberships = await prisma.projectMember.findMany({
        where: { userId: action.userId, projectId: { in: projectIds } },
        select: { projectId: true },
      });
      const heeft = new Set(memberships.map((m) => m.projectId));
      const buiten = projectIds.filter((p) => !heeft.has(p)).length;
      if (buiten > 0) {
        return NextResponse.json(
          { error: `De gekozen medewerker is geen deelnemer van ${buiten} van de betrokken projecten` },
          { status: 400 },
        );
      }
    }

    const where = buildBulkWhere(ids);

    // De drie delegates delen deze where/data-vorm maar niet hun generieke type.
    // Alleen tijdregels dragen een workLevel-snapshot; bij herindeling naar een
    // andere medewerker moet dat mee, anders blijft het tarief van de oude
    // eigenaar staan (zie src/app/api/time/[id]/route.ts voor dezelfde regel op
    // de losse-regel-endpoint).
    const { count } =
      action.type === "delete"
        ? await (model as any).deleteMany({ where })
        : await (model as any).updateMany({
            where,
            data:
              action.type === "user" && kind === "time"
                ? buildBulkData(action, { workLevel: targetUser!.workLevel })
                : buildBulkData(action),
          });

    return NextResponse.json({ count });
  } catch (e) { return handleError(e); }
}
