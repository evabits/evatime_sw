import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";

const schema = z.object({
  customerId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "COMPLETED"]),
  defaultHourlyRate: z.number().positive().optional().nullable(),
  defaultKmRate: z.number().positive().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true } },
        activityRates: { include: { activityType: true } },
        tags: { select: { id: true, name: true } },
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
    const { id } = await params;

    const { tags, ...rest } = schema.parse(await req.json());
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
    return NextResponse.json(project);
  } catch (e) { return handleError(e); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    await prisma.project.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
