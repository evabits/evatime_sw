import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";
import { buildBulkWhere, buildBulkData } from "@/lib/bulk-entries";

const schema = z.object({
  kind: z.enum(["time", "km", "expense"]),
  ids: z.array(z.string().min(1)).min(1).max(500),
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("project"), projectId: z.string().min(1) }),
    z.object({ type: z.literal("billable"), billable: z.boolean() }),
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

    if (action.type === "project") {
      const project = await prisma.project.findUnique({ where: { id: action.projectId }, select: { id: true } });
      if (!project) return NextResponse.json({ error: "Onbekend project" }, { status: 400 });
    }
    let targetUser: { id: string; workLevel: string | null } | null = null;
    if (action.type === "user") {
      targetUser = await prisma.user.findUnique({ where: { id: action.userId }, select: { id: true, workLevel: true } });
      if (!targetUser) return NextResponse.json({ error: "Onbekende medewerker" }, { status: 400 });
    }

    const model =
      kind === "time" ? prisma.timeEntry : kind === "km" ? prisma.kmEntry : prisma.expense;
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
