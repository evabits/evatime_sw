import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/utils";
import { isAdmin } from "@/lib/roles";
import { AbsenceClient } from "@/components/vacation/absence-client";
import { toWeekSchedule } from "@/lib/work-schedule";
import {
  contractYearBalance, fillBudgets, toContractVacation, toVacationOpening, vacationBalance,
  vacationLedger,
} from "@/lib/vacation-budget";
import { format } from "date-fns";

export default async function AbsencePage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const role = (session?.user as any)?.role ?? "EMPLOYEE";
  const admin = isAdmin(role);
  const nu = new Date();
  const year = nu.getFullYear();
  const vandaag = format(nu, "yyyy-MM-dd");
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);

  const [requests, budgets, users, currentUser, scheduleRows, contractRows, vakantieOpnames, openingRows] = await Promise.all([
    prisma.absenceRequest.findMany({
      where: {
        ...(admin ? {} : { userId }),
        startDate: { gte: yearStart, lte: yearEnd },
      },
      include: {
        user: { select: { id: true, name: true } },
        reviewer: { select: { id: true, name: true } },
        pattern: true,
      },
      orderBy: { startDate: "desc" },
    }),
    // Alle jaren, niet alleen het lopende: het saldo stapelt vanaf de
    // peildatum en heeft het recht van elk jaar daarna nodig. De tabel met
    // budgetten filtert er hieronder het lopende jaar weer uit.
    prisma.vacationBudget.findMany({
      where: admin ? {} : { userId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    admin
      ? prisma.user.findMany({
          where: { archivedAt: null },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    prisma.user.findUnique({ where: { id: userId }, select: { weeklyHours: true, name: true } }),
    // Een medewerker heeft alleen zijn eigen rooster nodig; een admin kan voor
    // iedereen aanvragen, dus die krijgt ze allemaal. Het zijn enkele rijen.
    prisma.workSchedule.findMany({ where: admin ? {} : { userId } }),
    // Alleen de velden die het budget bepalen: de rest van een contract is
    // salaris en heeft op dit scherm niets te zoeken.
    prisma.contract.findMany({
      where: admin ? {} : { userId },
      select: { userId: true, startDate: true, endDate: true, vacationHours: true },
    }),
    // Buiten het jaarvenster van de lijst hierboven: het saldo telt vanaf de
    // peildatum en die kan in een eerder jaar liggen.
    prisma.absenceRequest.findMany({
      where: { ...(admin ? {} : { userId }), status: "APPROVED", type: "VACATION" },
      select: { userId: true, startDate: true, endDate: true, hours: true },
    }),
    prisma.user.findMany({
      where: admin ? {} : { id: userId },
      select: { id: true, vacationOpeningDate: true, vacationOpeningUsed: true },
    }),
  ]);

  const calendarToken = process.env.VACATION_CALENDAR_TOKEN ?? "";

  // Op id, want de dialoog zoekt het rooster op van de medewerker waar de
  // aanvraag over gaat. toWeekSchedule maakt van de Decimals getallen; hier kan
  // hij nooit null geven, want elke rij bestaat.
  const schedules = Object.fromEntries(
    scheduleRows.map((r) => [r.userId, toWeekSchedule(r)!]),
  );

  // De budgetlijst aangevuld met wat de contracten opleveren. Dit gebeurt hier
  // en niet in de client, zodat de contracten de browser niet halen.
  const budgetRegels = fillBudgets(
    serialize(budgets).filter((b: any) => b.year === year).map((b: any) => ({ ...b, hours: Number(b.hours) })),
    admin ? users : [{ id: userId, name: currentUser?.name ?? "" }],
    toContractVacation(contractRows),
    year,
  );

  // Het saldo per medewerker: opgebouwd recht, opgenomen vakantie en wat er
  // overblijft, allemaal geteld vanaf zijn peildatum. Dit hoort op de server,
  // want de lijst in de browser bevat maar één jaar aan aanvragen.
  const contracten = toContractVacation(contractRows);
  const openings = new Map(openingRows.map((u) => [u.id, toVacationOpening(u)]));
  const saldoIds = new Set([userId, ...users.map((u) => u.id)]);
  const saldi = Object.fromEntries(
    [...saldoIds].map((id) => {
      const opening = openings.get(id) ?? null;
      const eigenContracten = contracten.filter((c) => c.userId === id);
      const opnames = vakantieOpnames
        .filter((a) => a.userId === id)
        .map((a) => ({
          date: a.startDate.toISOString().slice(0, 10),
          until: a.endDate.toISOString().slice(0, 10),
          hours: Number(a.hours),
        }));
      const saldo = vacationBalance(
        eigenContracten,
        budgets.filter((b) => b.userId === id).map((b) => ({ year: b.year, hours: Number(b.hours) })),
        opnames,
        opening,
        vandaag,
      );
      // Hetzelfde saldo, uitgesplitst naar het lopende contractjaar. Null zodra
      // die grens niet te trekken is; dan blijven de tegels bij het kalenderjaar.
      const contractJaar = opening
        ? contractYearBalance(eigenContracten, opnames, saldo, opening, vandaag)
        : null;
      return [id, { ...saldo, since: opening?.date ?? null, contractJaar }];
    }),
  );

  // De opsomming die het saldo verklaart, alleen voor de medewerker die je
  // bekijkt: die van een hele afdeling meesturen is een berg data waar het
  // scherm niets mee doet.
  const eigenOpening = openings.get(userId) ?? null;
  const ledger = eigenOpening
    ? vacationLedger(
        contracten.filter((c) => c.userId === userId),
        vakantieOpnames
          .filter((a) => a.userId === userId)
          .map((a) => ({
            date: a.startDate.toISOString().slice(0, 10),
            until: a.endDate.toISOString().slice(0, 10),
            hours: Number(a.hours),
          })),
        eigenOpening,
        vandaag,
      )
    : [];

  return (
    <AbsenceClient
      // toWeekSchedule maakt er null van als er geen patroon is. Zonder die
      // omzetting is pattern hier undefined en leest het formulier dat als
      // "wel een patroon", waardoor het vinkje bij elke bestaande aanvraag
      // aanstaat. serialize() laat de Decimals bovendien als string achter.
      initialRequests={serialize(requests).map((r: any) => ({
        ...r,
        hours: Number(r.hours),
        pattern: toWeekSchedule(r.pattern),
      }))}
      initialBudgets={budgetRegels}
      saldi={saldi}
      ledger={ledger}
      users={users}
      currentUserId={userId}
      isAdmin={admin}
      year={year}
      calendarToken={calendarToken}
      weeklyHours={Number(currentUser?.weeklyHours ?? 40)}
      schedules={schedules}
    />
  );
}

