import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatHours } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Car, Euro, TrendingUp } from "lucide-react";
import { DashboardChart } from "@/components/dashboard/dashboard-chart";
import { RecentEntries } from "@/components/dashboard/recent-entries";
import { startOfMonth, endOfMonth } from "date-fns";
import { serialize } from "@/lib/utils";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [timeStats, kmStats, projectStats, recentTime, recentKm] = await Promise.all([
    prisma.timeEntry.aggregate({
      where: { date: { gte: monthStart, lte: monthEnd } },
      _sum: { hours: true },
      _count: true,
    }),
    prisma.kmEntry.aggregate({
      where: { date: { gte: monthStart, lte: monthEnd } },
      _sum: { km: true },
      _count: true,
    }),
    prisma.project.findMany({
      where: { status: "ACTIVE" },
      include: {
        customer: { select: { name: true } },
        timeEntries: {
          where: { date: { gte: monthStart, lte: monthEnd } },
          select: { hours: true, rateOverride: true, activityType: { select: { defaultRate: true } } },
        },
        kmEntries: {
          where: { date: { gte: monthStart, lte: monthEnd } },
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
  ]);

  const totalHours = Number(timeStats._sum.hours ?? 0);
  const totalKm = Number(kmStats._sum.km ?? 0);

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
    return { name: p.name, customer: p.customer.name, hours, km };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Overzicht voor {now.toLocaleString("nl-NL", { month: "long", year: "numeric" })}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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

      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardChart data={projectSummary} />
        <RecentEntries timeEntries={serialize(recentTime)} kmEntries={serialize(recentKm)} />
      </div>
    </div>
  );
}
