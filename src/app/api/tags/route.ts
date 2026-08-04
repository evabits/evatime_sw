import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError, findTagByName } from "@/lib/api";
import { isAdmin } from "@/lib/roles";

export async function GET() {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tags = await prisma.tag.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json(tags);
  } catch (e) { return handleError(e); }
}

const createSchema = z.object({ name: z.string().trim().min(1) });

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any)?.role ?? "EMPLOYEE";
    if (!isAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { name } = createSchema.parse(await req.json());
    if (await findTagByName(name)) {
      return NextResponse.json({ error: "Er bestaat al een tag met deze naam" }, { status: 400 });
    }

    const tag = await prisma.tag.create({ data: { name } });
    return NextResponse.json(tag, { status: 201 });
  } catch (e: any) {
    // Vangnet voor de @unique: alleen bereikbaar wanneer twee mensen tegelijk
    // dezelfde naam opslaan, want de controle hierboven is ruimer dan de index.
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Er bestaat al een tag met deze naam" }, { status: 400 });
    }
    return handleError(e);
  }
}
