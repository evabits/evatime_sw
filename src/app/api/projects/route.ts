import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { projectCreateDenialReason } from "@/lib/projects";
import { archivedWhere } from "@/lib/archive";
import { levelRatesField } from "@/lib/rates";
import { canEditInvoices } from "@/lib/roles";

const schema = z.object({
  customerId: z.string().min(1).optional().nullable(),
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["CONCEPT", "ACTIVE", "INACTIVE", "COMPLETED"]).default("ACTIVE"),
  defaultKmRate: z.number().positive().optional().nullable(),
  tags: z.array(z.string()).optional(),
  levelRates: levelRatesField,
  billable: z.boolean().optional(),
  memberIds: z.array(z.string().min(1)).optional(),
});

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get("customerId");
    const status = searchParams.get("status");
    const includeArchived = searchParams.get("includeArchived") === "1";

    // This endpoint is also used by the time-entry form's project dropdown
    // for every role, so it must stay reachable for everyone — only the
    // levelRates rate card is withheld from non-admins. Same gate as
    // GET /api/time and GET /api/customers.
    const canSeeRates = canEditInvoices(role);

    const projects = await prisma.project.findMany({
      where: {
        ...(customerId ? { customerId } : {}),
        ...(status ? { status: status as any } : {}),
        ...archivedWhere(includeArchived),
      },
      orderBy: { name: "asc" },
      include: {
        customer: { select: { name: true } },
        _count: { select: { timeEntries: true, kmEntries: true } },
        tags: { select: { id: true, name: true } },
        ...(canSeeRates ? { levelRates: true } : {}),
        members: { select: { userId: true } },
      },
    });
    return NextResponse.json(projects);
  } catch (e) { return handleError(e); }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as { role?: string })?.role ?? "EMPLOYEE";
    const { tags, levelRates, memberIds, ...rest } = schema.parse(await req.json());

    const denial = projectCreateDenialReason(role, { ...rest, levelRates, memberIds });
    if (denial) return NextResponse.json({ error: denial }, { status: 403 });

    const project = await prisma.project.create({
      data: {
        ...rest,
        ...(tags && tags.length > 0
          ? {
              tags: {
                connectOrCreate: tags.map((name) => ({ where: { name }, create: { name } })),
              },
            }
          : {}),
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
    // De aanmaker moet erop kunnen boeken; anders levert het knopje in het
    // urenformulier een project op dat voor hem onbruikbaar is. Dit geldt
    // ongeacht een meegestuurde memberIds — de unie hieronder zorgt dat de
    // aanmaker nooit buiten de boot valt, ook niet als de aanroeper hem
    // vergeet of expliciet weglaat.
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: session.user!.id! },
    });
    const finalMemberIds = memberIds
      ? Array.from(new Set([...memberIds, session.user!.id!]))
      : [session.user!.id!];
    if (memberIds) {
      await prisma.$transaction([
        prisma.projectMember.deleteMany({ where: { projectId: project.id } }),
        ...finalMemberIds.map((userId) =>
          prisma.projectMember.create({ data: { projectId: project.id, userId } }),
        ),
      ]);
    }
    return NextResponse.json(
      { ...project, ...(levelRates ? { levelRates } : {}), members: finalMemberIds.map((userId) => ({ userId })) },
      { status: 201 },
    );
  } catch (e) { return handleError(e); }
}
