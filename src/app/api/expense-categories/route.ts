import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/api";
import { isAdmin } from "@/lib/roles";

const schema = z.object({ name: z.string().min(1) });

export async function GET() {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const categories = await prisma.expenseCategory.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json(categories);
  } catch (e) { return handleError(e); }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !isAdmin((session.user as any)?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const data = schema.parse(await req.json());
    const category = await prisma.expenseCategory.create({ data });
    return NextResponse.json(category, { status: 201 });
  } catch (e) { return handleError(e); }
}
