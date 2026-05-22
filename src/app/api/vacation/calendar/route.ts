import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";

function icalDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

const TYPE_LABELS: Record<string, string> = {
  VACATION: "Vakantie",
  SICK: "Ziekteverlof",
  SPECIAL_LEAVE: "Bijzonder verlof",
  UNPAID_LEAVE: "Onbetaald verlof",
};

function absenceTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

function escapeIcal(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// iCal all-day DTEND is exclusive — add one day
function nextDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");
    const expectedToken = process.env.VACATION_CALENDAR_TOKEN;
    if (!expectedToken || token !== expectedToken) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const requests = await prisma.absenceRequest.findMany({
      where: { status: "APPROVED" },
      include: { user: { select: { name: true } } },
      orderBy: { startDate: "asc" },
    });

    const now = new Date();
    const dtstamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}T${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}${String(now.getUTCSeconds()).padStart(2, "0")}Z`;

    const events = requests
      .map((r) => {
        const lines = [
          "BEGIN:VEVENT",
          `UID:${r.id}@evatime`,
          `DTSTAMP:${dtstamp}`,
          `DTSTART;VALUE=DATE:${icalDate(r.startDate)}`,
          `DTEND;VALUE=DATE:${icalDate(nextDay(r.endDate))}`,
          `SUMMARY:${escapeIcal(absenceTypeLabel(r.type))}: ${escapeIcal(r.user.name)}`,
          `DESCRIPTION:${escapeIcal(`${Number(r.hours)} uur${r.description ? " - " + r.description : ""}`)}`,
          "END:VEVENT",
        ];
        return lines.join("\r\n");
      })
      .join("\r\n");

    const calendar = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//EvaTime//Vakantiekalender//NL",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:EvaTime Vakanties",
      events,
      "END:VCALENDAR",
    ]
      .filter(Boolean)
      .join("\r\n");

    return new NextResponse(calendar, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="vakanties.ics"',
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) { return handleError(e); }
}
