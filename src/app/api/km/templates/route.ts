import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { serialize } from "@/lib/utils";
import { kmTemplateSchema as schema } from "@/lib/km-template";

const include = {
  project: { select: { id: true, name: true, customer: { select: { id: true, name: true } } } },
  activityType: { select: { id: true, name: true } },
} as const;

export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const templates = await prisma.kmTemplate.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      include,
    });
    return NextResponse.json(serialize(templates));
  } catch (e) { return handleError(e); }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const currentUserId = session?.user?.id;
    if (!currentUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session!.user as any)?.role ?? "EMPLOYEE";
    const admin = role === "ADMIN";

    const body = await req.json();
    const data = schema.parse(body);
    // Admins may create a managed template for a target user; everyone else creates their own.
    const targetUserId = admin && typeof body.userId === "string" ? body.userId : currentUserId;
    const managedByAdmin = admin && body.managedByAdmin === true;

    const template = await prisma.kmTemplate.create({
      data: { ...data, userId: targetUserId, managedByAdmin },
      include,
    });
    return NextResponse.json(serialize(template), { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Naam bestaat al" }, { status: 409 });
    return handleError(e);
  }
}
