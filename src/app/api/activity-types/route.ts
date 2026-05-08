import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";

const schema = z.object({
  name: z.string().min(1),
  defaultRate: z.number().positive().optional().nullable(),
});

export async function GET() {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const types = await prisma.activityType.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json(types);
  } catch (e) { return handleError(e); }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const data = schema.parse(await req.json());
    const type = await prisma.activityType.create({ data });
    return NextResponse.json(type, { status: 201 });
  } catch (e) { return handleError(e); }
}
