import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatHours } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Car, Euro, TrendingUp, Umbrella, CalendarDays, ClipboardCheck, FolderOpen } from "lucide-react";
import { DashboardChart } from "@/components/dashboard/dashboard-chart";
import { RecentEntries } from "@/components/dashboard/recent-entries";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { serialize } from "@/lib/utils";
import { resolveHourRate } from "@/lib/rates";
import { isBillable } from "@/lib/billable";
import { canLeadStandup } from "@/lib/roles";
import { previousWorkingDay } from "@/lib/working-days";
import { countMissingHours } from "@/lib/missing-hours";
import { toContractVacation, toVacationOpening, vacationBalance } from "@/lib/vacation-budget";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const role = (session?.user as any)?.role ?? "EMPLOYEE";
  const isAdmin = role === "ADMIN";
  // Niet isAdmin: de teamleider leidt de standup en moet deze waarschuwing
  // juist zien.
  const magStandup = canLeadStandup(role);
  const now = new Date();
  // Dezelfde dag als de standup meet: de vorige werkdag ten opzichte van nu.
  const standupDag = previousWorkingDay(format(now, "yyyy-MM-dd"));
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const currentYear = now.getFullYear();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Employees see only their own totals; admins see company-wide.
  const ownerFilter = isAdmin ? {} : { userId };

  const [timeStats, kmStats, projectStats, recentTime, recentKm, vacationBudgets, vacationApproved, upcomingVacations, pendingVacations, customerlessProjects, missendeUren, eigenContracten, eigenGebruiker] = await Promise.all([
    prisma.timeEntry.aggregate({
      where: { date: { gte: monthStart, lte: monthEnd }, ...ownerFilter },
      _sum: { hours: true },
      _count: true,
    }),
    prisma.kmEntry.aggregate({
      where: { date: { gte: monthStart, lte: monthEnd }, ...ownerFilter },
      _sum: { km: true },
      _count: true,
    }),
    prisma.project.findMany({
      where: { status: "ACTIVE", archivedAt: null },
      include: {
        customer: { select: { name: true, levelRates: true } },
        timeEntries: {
          where: { date: { gte: monthStart, lte: monthEnd }, ...ownerFilter },
          select: { hours: true, rateOverride: true, workLevel: true, user: { select: { workLevel: true } } },
        },
        kmEntries: {
          where: { date: { gte: monthStart, lte: monthEnd }, ...ownerFilter },
          select: { km: true, rateOverride: true },
        },
        levelRates: true,
      },
      take: 10,
    }),
    prisma.timeEntry.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 5,
      include: { project: { select: { name: true } } },
    }),
    prisma.kmEntry.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 5,
      include: { project: { select: { name: true } } },
    }),
    // Alle jaren, niet alleen het lopende: het saldo stapelt vanaf de
    // peildatum en heeft het recht van elk jaar daarna nodig.
    prisma.vacationBudget.findMany({
      where: { userId },
      select: { year: true, hours: true },
    }),
    prisma.absenceRequest.findMany({
      where: { userId, status: "APPROVED", type: "VACATION" },
      select: { startDate: true, hours: true },
    }),
    isAdmin
      ? prisma.absenceRequest.findMany({
          where: { status: "APPROVED", endDate: { gte: today } },
          include: { user: { select: { name: true } } },
          orderBy: { startDate: "asc" },
          take: 5,
        })
      : Promise.resolve([]),
    isAdmin
      ? prisma.absenceRequest.count({ where: { status: "PENDING" } })
      : Promise.resolve(0),
    isAdmin
      ? prisma.project.count({ where: { customerId: null, archivedAt: null } })
      : Promise.resolve(0),
    magStandup ? countMissingHours(standupDag) : Promise.resolve(0),
    // Alleen de velden die het vakantiebudget bepalen; de rest van een
    // contract is salaris en hoort hier niet.
    prisma.contract.findMany({
      where: { userId },
      select: { userId: true, startDate: true, endDate: true, vacationHours: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { vacationOpeningDate: true, vacationOpeningHours: true },
    }),
  ]);

  const pendingReview = userId
    ? await prisma.performanceReview.findFirst({
        where: { userId, status: { in: ["PLANNED", "SELF_COMPLETED"] } },
        orderBy: { createdAt: "desc" },
        select: { id: true, period: true, status: true },
      })
    : null;

  const totalHours = Number(timeStats._sum.hours ?? 0);
  const totalKm = Number(kmStats._sum.km ?? 0);
  // Een budgetrij voor een jaar wint; anders zegt het contract het. Met een
  // beginsaldo stapelt het recht vanaf de peildatum, zonder blijft het bij het
  // lopende jaar.
  const { entitled: vacBudgetHours, used: vacUsedHours, remaining: vacRemainingHours } =
    vacationBalance(
      toContractVacation(eigenContracten),
      vacationBudgets.map((b) => ({ year: b.year, hours: Number(b.hours) })),
      vacationApproved.map((a) => ({
        date: a.startDate.toISOString().slice(0, 10),
        hours: Number(a.hours),
      })),
      toVacationOpening(eigenGebruiker),
      currentYear,
    );

  const totalRevenue = projectStats.reduce((sum, project) => {
    const projectBillable = isBillable({ project }) === true;
    const levelRates = project.levelRates.map((r) => ({ level: r.level, rate: Number(r.rate) }));
    const customerLevelRates = project.customer?.levelRates.map((r) => ({ level: r.level, rate: Number(r.rate) }));
    const hourRevenue = project.timeEntries.filter(() => projectBillable).reduce((s, e) => {
      const rate = resolveHourRate({
        rateOverride: e.rateOverride == null ? null : Number(e.rateOverride),
        workLevel: e.workLevel,
        user: e.user,
        project: { levelRates, customer: project.customer ? { levelRates: customerLevelRates } : null },
      });
      return rate == null ? s : s + Number(e.hours) * rate;
    }, 0);
    const kmRevenue = project.kmEntries.filter(() => projectBillable).reduce((s, e) => {
      const rate = Number(e.rateOverride ?? project.defaultKmRate ?? 0);
      return s + Number(e.km) * rate;
    }, 0);
    return sum + hourRevenue + kmRevenue;
  }, 0);

  const projectSummary = projectStats.map((p) => {
    const hours = p.timeEntries.reduce((s, e) => s + Number(e.hours), 0);
    const km = p.kmEntries.reduce((s, e) => s + Number(e.km), 0);
    return { name: p.name, customer: p.customer?.name ?? "—", hours, km };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Overzicht voor {now.toLocaleString("nl-NL", { month: "long", year: "numeric" })}</p>
      </div>

      {pendingReview && pendingReview.status === "PLANNED" && (
        <Link href="/beoordelingen" className="block">
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="p-4 flex items-center gap-3">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Zelfreflectie openstaand ({pendingReview.period})</p>
                <p className="text-sm text-muted-foreground">Vul je zelfreflectie in vóór het gesprek.</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}

      {isAdmin && customerlessProjects > 0 && (
        <Link href="/projects?filter=no-customer" className="block">
          <Card className="border-amber-500/40 bg-amber-500/5 dark:border-amber-900 dark:bg-amber-950/30">
            <CardContent className="p-4 flex items-center gap-3">
              <FolderOpen className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-medium">
                  {customerlessProjects} {customerlessProjects === 1 ? "project" : "projecten"} zonder klant
                </p>
                <p className="text-sm text-muted-foreground">Koppel een klant zodat ze gefactureerd kunnen worden.</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}

      {magStandup && missendeUren > 0 && (
        <Link href="/standup" className="block">
          <Card className="border-amber-500/40 bg-amber-500/5 dark:border-amber-900 dark:bg-amber-950/30">
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-medium">
                  {missendeUren === 1
                    ? "1 medewerker miste uren"
                    : `${missendeUren} medewerkers misten uren`}{" "}
                  op {new Date(`${standupDag}T00:00:00Z`).toLocaleDateString("nl-NL", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    timeZone: "UTC",
                  })}
                </p>
                <p className="text-sm text-muted-foreground">
                  Laat ze bijboeken vóór de standup begint.
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}

      <div className={`grid gap-4 md:grid-cols-2 ${isAdmin ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Uren deze maand</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatHours(totalHours)}</div>
            <p className="text-xs text-muted-foreground">{timeStats._count} registraties</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Kilometers deze maand</CardTitle>
            <Car className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalKm.toFixed(0)} km</div>
            <p className="text-xs text-muted-foreground">{kmStats._count} registraties</p>
          </CardContent>
        </Card>

        {isAdmin && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Omzet deze maand</CardTitle>
              <Euro className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
              <p className="text-xs text-muted-foreground">excl. BTW</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Actieve projecten</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projectStats.length}</div>
            <p className="text-xs text-muted-foreground">lopende projecten</p>
          </CardContent>
        </Card>
      </div>

      {/* Vacation summary */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Vakantie resterend {currentYear}</CardTitle>
            <Umbrella className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${vacRemainingHours < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
              {vacRemainingHours}u
            </div>
            <p className="text-xs text-muted-foreground">
              {vacUsedHours}u van {vacBudgetHours}u opgenomen
            </p>
            <Link href="/absence" className="text-xs text-primary underline-offset-2 hover:underline mt-1 block">
              Bekijken →
            </Link>
          </CardContent>
        </Card>

        {isAdmin && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Afwezigheidsaanvragen</CardTitle>
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingVacations}</div>
              <p className="text-xs text-muted-foreground">
                {pendingVacations === 1 ? "aanvraag wacht" : "aanvragen wachten"} op goedkeuring
              </p>
              {pendingVacations > 0 && (
                <Link href="/absence" className="text-xs text-primary underline-offset-2 hover:underline mt-1 block">
                  Bekijken →
                </Link>
              )}
            </CardContent>
          </Card>
        )}

        {isAdmin && upcomingVacations.length > 0 && (
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Aankomende afwezigheid</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {serialize(upcomingVacations).map((v: any) => (
                  <li key={v.id} className="text-xs flex justify-between gap-2">
                    <span className="font-medium truncate">{v.user.name}</span>
                    <span className="text-muted-foreground whitespace-nowrap">
                      {new Date(v.startDate).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
                      {v.startDate !== v.endDate && (
                        <> – {new Date(v.endDate).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}</>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardChart data={projectSummary} />
        <RecentEntries timeEntries={serialize(recentTime)} kmEntries={serialize(recentKm)} />
      </div>
    </div>
  );
}
