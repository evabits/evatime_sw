import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError, projectMembershipError } from "@/lib/api";
import { serialize } from "@/lib/utils";
import { kmTemplateSchema as schema, canManageTemplate } from "@/lib/km-template";
import { membershipCheckNeeded } from "@/lib/project-members";

const include = {
  project: { select: { id: true, name: true, customer: { select: { id: true, name: true } } } },
} as const;

async function loadAuthorized(id: string) {
  const session = await auth();
  const currentUserId = session?.user?.id;
  if (!currentUserId) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const role = (session!.user as any)?.role ?? "EMPLOYEE";

  const template = await prisma.kmTemplate.findUnique({ where: { id } });
  if (!template) return { error: NextResponse.json({ error: "Niet gevonden" }, { status: 404 }) };

  if (!canManageTemplate({ role, currentUserId, ownerId: template.userId, managedByAdmin: template.managedByAdmin })) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { template };
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const gate = await loadAuthorized(id);
    if (gate.error) return gate.error;

    const data = schema.parse(await req.json());

    if (membershipCheckNeeded(
      { projectId: gate.template!.projectId, userId: gate.template!.userId },
      { projectId: data.projectId, userId: gate.template!.userId },
    )) {
      const memberError = await projectMembershipError(data.projectId, gate.template!.userId);
      if (memberError) return memberError;
    }

    await prisma.kmTemplate.update({ where: { id }, data });
    const updated = await prisma.kmTemplate.findUnique({ where: { id }, include });
    return NextResponse.json(serialize(updated));
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Naam bestaat al" }, { status: 409 });
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const gate = await loadAuthorized(id);
    if (gate.error) return gate.error;

    await prisma.kmTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
