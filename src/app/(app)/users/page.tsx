import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { UsersClient } from "@/components/users/users-client";

export default async function UsersPage() {
  const session = await auth();
  const currentUserId = session?.user?.id ?? "";
  const currentUserRole = (session?.user as any)?.role ?? "EMPLOYEE";

  const rawUsers = await prisma.user.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, email: true, role: true, weeklyHours: true, workLevel: true,
      vacationOpeningDate: true, vacationOpeningUsed: true,
      createdAt: true, archivedAt: true,
    },
  });
  const users = rawUsers.map((u) => ({
    ...u,
    weeklyHours: u.weeklyHours ? Number(u.weeklyHours) : null,
    vacationOpeningDate: u.vacationOpeningDate
      ? u.vacationOpeningDate.toISOString().slice(0, 10)
      : null,
    vacationOpeningUsed: u.vacationOpeningUsed != null ? Number(u.vacationOpeningUsed) : null,
    createdAt: u.createdAt.toISOString(),
    archivedAt: u.archivedAt ? u.archivedAt.toISOString() : null,
  }));

  return (
    <UsersClient
      initialUsers={users}
      currentUserId={currentUserId}
      isAdmin={currentUserRole === "ADMIN"}
    />
  );
}
