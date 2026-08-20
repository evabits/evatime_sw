import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { handleError } from "@/lib/api";
import {
  vacationOpeningDateField, vacationOpeningUsedField, weeklyHoursField, workLevelField,
  overtimeOpeningDateField, overtimeOpeningHoursField,
} from "@/lib/user-schema";
import { validateOpeningDate } from "@/lib/overtime";

const updateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["ADMIN", "FINANCE", "TEAMLEAD", "EMPLOYEE"]),
  password: z.string().min(8).optional().or(z.literal("")),
  weeklyHours: weeklyHoursField,
  workLevel: workLevelField,
  vacationOpeningDate: vacationOpeningDateField,
  vacationOpeningUsed: vacationOpeningUsedField,
  overtimeOpeningDate: overtimeOpeningDateField,
  overtimeOpeningHours: overtimeOpeningHoursField,
});

const userSelect = {
  id: true, name: true, email: true, role: true, weeklyHours: true, workLevel: true,
  vacationOpeningDate: true, vacationOpeningUsed: true,
  overtimeOpeningDate: true, overtimeOpeningHours: true,
  createdAt: true, archivedAt: true,
} as const;

function serializeUser(u: { weeklyHours: any } & Record<string, any>) {
  return {
    ...u,
    weeklyHours: u.weeklyHours != null ? Number(u.weeklyHours) : null,
    // Als @db.Date leest Prisma dit terug als middernacht UTC; de kale datum is
    // wat het formulier nodig heeft.
    vacationOpeningDate: u.vacationOpeningDate
      ? u.vacationOpeningDate.toISOString().slice(0, 10)
      : null,
    vacationOpeningUsed: u.vacationOpeningUsed != null ? Number(u.vacationOpeningUsed) : null,
    overtimeOpeningDate: u.overtimeOpeningDate
      ? u.overtimeOpeningDate.toISOString().slice(0, 10)
      : null,
    overtimeOpeningHours: u.overtimeOpeningHours != null ? Number(u.overtimeOpeningHours) : null,
  };
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const currentUser = session.user as any;
    const isSelf = currentUser?.id === id;
    const isAdmin = currentUser?.role === "ADMIN";

    if (!isAdmin && !isSelf) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const data = updateSchema.parse(await req.json());
    if (!isAdmin && data.role !== (currentUser?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updateData: any = { name: data.name, email: data.email };
    if (isAdmin) {
      // Alleen hier gecontroleerd (en niet vóór de isAdmin-tak): het veld
      // wordt toch alleen door een beheerder weggeschreven, dus een gewone
      // medewerker die zijn eigen naam wijzigt mag hier geen 400 op krijgen
      // voor een peildatum die hij niet eens kan zetten.
      const peilFout = validateOpeningDate(data.overtimeOpeningDate);
      if (peilFout) return NextResponse.json({ error: peilFout }, { status: 400 });

      updateData.role = data.role;
      updateData.weeklyHours = data.weeklyHours ?? null;
      updateData.workLevel = data.workLevel ?? null;
      // De datum als middernacht UTC, zodat een @db.Date-kolom precies de dag
      // bewaart die is ingevuld en niet die ervoor.
      updateData.vacationOpeningDate = data.vacationOpeningDate
        ? new Date(`${data.vacationOpeningDate}T00:00:00Z`)
        : null;
      updateData.vacationOpeningUsed = data.vacationOpeningUsed ?? null;
      // Alleen schrijven als de sleutel is meegestuurd: schermen die deze
      // twee urensaldo-velden niet kennen (zoals het huidige
      // gebruikersformulier) sturen ze helemaal niet mee, en dan is
      // data.overtimeOpeningDate/-Hours undefined. Zonder deze guard zou
      // zo'n opslag (bijv. alleen een naamswijziging) de kolom stilzwijgend
      // op null zetten en de beginstand wissen. Zie overtimeOpeningDateField
      // in user-schema.ts voor het undefined/null-onderscheid dat dit
      // mogelijk maakt.
      if (data.overtimeOpeningDate !== undefined) {
        updateData.overtimeOpeningDate = data.overtimeOpeningDate
          ? new Date(`${data.overtimeOpeningDate}T00:00:00Z`)
          : null;
      }
      if (data.overtimeOpeningHours !== undefined) {
        updateData.overtimeOpeningHours = data.overtimeOpeningHours;
      }
    }
    if (data.password) updateData.password = await hash(data.password, 12);

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: userSelect,
    });
    return NextResponse.json(serializeUser(user));
  } catch (e) { return handleError(e); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || (session.user as any)?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    if ((session.user as any)?.id === id) {
      return NextResponse.json({ error: "Kan eigen account niet verwijderen" }, { status: 400 });
    }
    await prisma.user.update({ where: { id }, data: { archivedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || (session.user as any)?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    await prisma.user.update({ where: { id }, data: { archivedAt: null } });
    return NextResponse.json({ success: true });
  } catch (e) { return handleError(e); }
}
