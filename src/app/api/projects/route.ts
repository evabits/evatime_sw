import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";

const schema = z.object({
  customerId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "COMPLETED"]).default("ACTIVE"),
  defaultHourlyRate: z.number().positive().optional().nullable(),
  defaultKmRate: z.number().positive().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get("customerId");
    const status = searchParams.get("status");
    const projects = await prisma.project.findMany({
      where: {
        ...(customerId ? { customerId } : {}),
        ...(status ? { status: status as any } : {}),
      },
      orderBy: { name: "asc" },
      include: {
        customer: { select: { name: true } },
        _count: { select: { timeEntries: true, kmEntries: true } },
        tags: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(projects);
  } catch (e) { return handleError(e); }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { tags, ...rest } = schema.parse(await req.json());
    const project = await prisma.project.create({
      data: {
        ...rest,
        ...(tags && tags.length > 0
          ? {
              tags: {
                connectOrCreate: tags.map((name) => ({
                  where: { name },
                  create: { name },
                })),
              },
            }
          : {}),
      },
      include: { tags: { select: { id: true, name: true } } },
    });
    return NextResponse.json(project, { status: 201 });
  } catch (e) { return handleError(e); }
}
