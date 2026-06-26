import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatHours } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Car, Euro, TrendingUp, Umbrella, CalendarDays, ClipboardCheck } from "lucide-react";
import { DashboardChart } from "@/components/dashboard/dashboard-chart";
import { RecentEntries } from "@/components/dashboard/recent-entries";
import { startOfMonth, endOfMonth } from "date-fns";
import { serialize } from "@/lib/utils";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const role = (session?.user as any)?.role ?? "EMPLOYEE";
  const isAdmin = role === "ADMIN";
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const currentYear = now.getFullYear();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Employees see only their own totals; admins see company-wide.
  const ownerFilter = isAdmin ? {} : { userId };

  const [timeStats, kmStats, projectStats, recentTime, recentKm, vacationBudget, vacationApproved, upcomingVacations, pendingVacations] = await Promise.all([
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
      where: { status: "ACTIVE" },
      include: {
        customer: { select: { name: true } },
        timeEntries: {
          where: { date: { gte: monthStart, lte: monthEnd }, ...ownerFilter },
          select: { hours: true, rateOverride: true, activityType: { select: { defaultRate: true } } },
        },
        kmEntries: {
          where: { date: { gte: monthStart, lte: monthEnd }, ...ownerFilter },
          select: { km: true, rateOverride: true },
        },
      },
      take: 10,
    }),
    prisma.timeEntry.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 5,
      include: { project: { select: { name: true } }, activityType: { select: { name: true } } },
    }),
    prisma.kmEntry.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 5,
      include: { project: { select: { name: true } } },
    }),
    prisma.vacationBudget.findUnique({
      where: { userId_year: { userId, year: currentYear } },
    }),
    prisma.absenceRequest.aggregate({
      where: { userId, status: "APPROVED", type: "VACATION", startDate: { gte: new Date(currentYear, 0, 1) } },
      _sum: { hours: true },
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
  const vacBudgetHours = Number(vacationBudget?.hours ?? 0);
  const vacUsedHours = Number(vacationApproved._sum.hours ?? 0);
  const vacRemainingHours = vacBudgetHours - vacUsedHours;

  const totalRevenue = projectStats.reduce((sum, project) => {
    const hourRevenue = project.timeEntries.reduce((s, e) => {
      const rate = Number(e.rateOverride ?? e.activityType?.defaultRate ?? project.defaultHourlyRate ?? 0);
      return s + Number(e.hours) * rate;
    }, 0);
    const kmRevenue = project.kmEntries.reduce((s, e) => {
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
                <p className="font-medium">Zelfbeoordeling openstaand ({pendingReview.period})</p>
                <p className="text-sm text-muted-foreground">Vul je zelfbeoordeling in vóór het gesprek.</p>
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
            <div className={`text-2xl font-bold ${vacRemainingHours < 0 ? "text-red-600" : ""}`}>
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
