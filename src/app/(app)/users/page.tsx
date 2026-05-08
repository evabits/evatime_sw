import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { UsersClient } from "@/components/users/users-client";

export default async function UsersPage() {
  const session = await auth();
  const currentUserId = session?.user?.id ?? "";
  const currentUserRole = (session?.user as any)?.role ?? "EMPLOYEE";

  const rawUsers = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });
  const users = rawUsers.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }));

  return (
    <UsersClient
      initialUsers={users}
      currentUserId={currentUserId}
      isAdmin={currentUserRole === "ADMIN"}
    />
  );
}
