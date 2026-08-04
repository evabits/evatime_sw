import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError, projectNameTakenError } from "@/lib/api";
import { levelRatesField } from "@/lib/rates";
import { isAdmin } from "@/lib/roles";

const schema = z.object({
  customerId: z.string().min(1),
  name: z.string().trim().min(1),
  description: z.string().optional(),
  status: z.enum(["CONCEPT", "ACTIVE", "INACTIVE", "COMPLETED"]),
  defaultKmRate: z.number().positive().optional().nullable(),
  tags: z.array(z.string()).optional(),
  levelRates: levelRatesField,
  billable: z.boolean().optional(),
  memberIds: z.array(z.string().min(1)).optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    const { id } = await params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true } },
        tags: { select: { id: true, name: true } },
        levelRates: true,
        ...(isAdmin(role) ? { members: { select: { userId: true } } } : {}),
      },
    });
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(project);
  } catch (e) { return handleError(e); }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    // Unlike POST (where projectCreateDenialReason still lets employees create
    // bare concept projects), editing an EXISTING project is only exposed via
    // the admin-only /projects page, and this route lets the caller reassign
    // the customer, status and levelRates in one call — so the whole route is
    // admin-only rather than stripping just levelRates.
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;

    const { tags, levelRates, memberIds, ...rest } = schema.parse(await req.json());
    const nameError = await projectNameTakenError(rest.name, id);
    if (nameError) return nameError;
    const project = await prisma.project.update({
      where: { id },
      data: {
        ...rest,
        tags: {
          set: [],
          ...(tags && tags.length > 0
            ? {
                connectOrCreate: tags.map((name) => ({
                  where: { name },
                  create: { name },
                })),
              }
            : {}),
        },
      },
      include: { tags: { select: { id: true, name: true } } },
    });
    if (levelRates) {
      await prisma.$transaction([
        prisma.projectLevelRate.deleteMany({ where: { projectId: project.id } }),
        ...levelRates.map((r) =>
          prisma.projectLevelRate.create({
            data: { projectId: project.id, level: r.level as any, rate: r.rate },
          }),
        ),
      ]);
    }
    if (memberIds) {
      await prisma.$transaction([
        prisma.projectMember.deleteMany({ where: { projectId: project.id } }),
        ...memberIds.map((userId) =>
          prisma.projectMember.create({ data: { projectId: project.id, userId } }),
        ),
      ]);
    }
    return NextResponse.json({
      ...project,
      ...(levelRates ? { levelRates } : {}),
      ...(memberIds ? { members: memberIds.map((userId) => ({ userId })) } : {}),
    });
  } catch (e: any) {
    // Vangnet voor de @unique: alleen bereikbaar bij twee gelijktijdige opslagen.
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Er bestaat al een project met deze naam" }, { status: 400 });
    }
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;

    await prisma.project.update({ where: { id }, data: { archivedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    await prisma.project.update({ where: { id }, data: { archivedAt: null } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
